const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { DATA_DIR, CACHE_DIR } = require('../config');
const { toSlug } = require('./slug');

// In-memory registry, built once at startup (and rebuilt on /api/reload).
// editionsBySlug: { [slug]: { relPath, dirPath, name, surahNumbers: Set } }
let editionsBySlug = null;
let editionSlugOrder = [];

function stripBOM(str) {
  return str.replace(/^\uFEFF/, '');
}

async function readJSON(filePath) {
  const raw = await fsp.readFile(filePath, 'utf8');
  return JSON.parse(stripBOM(raw));
}

const SURAH_FILE_RE = /^(\d+)\.json$/i;
const AYAH_FILE_RE = /^(\d+)\.json$/i;

function isDirSync(fullPath) {
  try {
    return fs.statSync(fullPath).isDirectory();
  } catch {
    return false;
  }
}

/**
 * A directory "looks like" a tafsir edition if it directly contains at
 * least one numbered surah file (1.json, 2.json, ...) or numbered surah
 * folder (1/, 2/, ...). This is what lets the server recognize new
 * editions dropped in later without any config changes.
 */
async function numericSurahNumbers(dirPath) {
  let entries;
  try {
    entries = await fsp.readdir(dirPath);
  } catch {
    return new Set();
  }
  const numbers = new Set();
  for (const name of entries) {
    const m = SURAH_FILE_RE.exec(name);
    if (m) {
      numbers.add(parseInt(m[1], 10));
      continue;
    }
    if (/^\d+$/.test(name) && isDirSync(path.join(dirPath, name))) {
      numbers.add(parseInt(name, 10));
    }
  }
  return numbers;
}

/**
 * Scans DATA_DIR for tafsir editions, up to two levels deep:
 *   DATA_DIR/<edition>/...                  -> slug "<edition>"
 *   DATA_DIR/<group>/<edition>/...          -> slug "<group>-<edition>"
 * so both a flat layout and a language-grouped layout work without any
 * configuration. Never throws: an empty or missing DATA_DIR just yields
 * zero editions plus a warning, so the server still starts.
 */
async function loadRegistry() {
  const registry = {};
  const order = [];

  if (!fs.existsSync(DATA_DIR)) {
    editionsBySlug = {};
    editionSlugOrder = [];
    return {
      editions: 0,
      warning:
        `DATA_DIR does not exist (${DATA_DIR}). Upload/extract your tafsir ` +
        'edition folders there (see README.md), then call POST /api/reload or redeploy.',
    };
  }

  const topEntries = await fsp.readdir(DATA_DIR).then((names) => names.map((name) => ({ name })));

  for (const top of topEntries) {
    if (!isDirSync(path.join(DATA_DIR, top.name))) continue;
    const topPath = path.join(DATA_DIR, top.name);
    const topSurahs = await numericSurahNumbers(topPath);

    if (topSurahs.size > 0) {
      // Flat layout: DATA_DIR/<edition>/...
      const slug = toSlug(top.name);
      registry[slug] = {
        relPath: top.name,
        dirPath: topPath,
        name: top.name,
        surahNumbers: topSurahs,
      };
      order.push(slug);
      continue;
    }

    // Not an edition itself - check one level down (language-grouped layout).
    let subEntries;
    try {
      subEntries = await fsp.readdir(topPath);
    } catch {
      continue;
    }
    for (const subName of subEntries) {
      const subPath = path.join(topPath, subName);
      if (!isDirSync(subPath)) continue;
      const subSurahs = await numericSurahNumbers(subPath);
      if (subSurahs.size === 0) continue;

      const relPath = path.join(top.name, subName);
      const slug = toSlug(`${top.name}-${subName}`);
      registry[slug] = {
        relPath,
        dirPath: subPath,
        name: subName,
        group: top.name,
        surahNumbers: subSurahs,
      };
      order.push(slug);
    }
  }

  editionsBySlug = registry;
  editionSlugOrder = order.sort((a, b) =>
    (registry[a].name || a).localeCompare(registry[b].name || b)
  );

  if (!fs.existsSync(CACHE_DIR)) {
    await fsp.mkdir(CACHE_DIR, { recursive: true });
  }

  if (order.length === 0) {
    return {
      editions: 0,
      warning:
        `No tafsir editions found under DATA_DIR (${DATA_DIR}). Each edition ` +
        'needs numbered surah files (1.json, 2.json, ...) directly inside it, ' +
        'or one folder level down for a language-grouped layout.',
    };
  }

  return { editions: order.length };
}

function isReady() {
  return editionsBySlug !== null && editionSlugOrder.length > 0;
}

function listEditions() {
  if (!editionsBySlug) return [];
  return editionSlugOrder.map((slug) => {
    const e = editionsBySlug[slug];
    return {
      slug,
      name: e.name,
      group: e.group || null,
      total_surahs: e.surahNumbers.size,
    };
  });
}

function getEdition(slug) {
  if (!editionsBySlug) return null;
  return editionsBySlug[slug] || null;
}

/**
 * Lists which surahs have data for an edition. Ayah count comes from the
 * combined <surah>.json file (one parse per surah); the empty-ayah count,
 * when present, comes from the flat <surah>.empty_ayahs.json file sitting
 * next to it.
 */
async function listSurahs(slug) {
  const e = getEdition(slug);
  if (!e) return null;

  const numbers = Array.from(e.surahNumbers).sort((a, b) => a - b);
  const out = [];
  for (const num of numbers) {
    const combinedPath = path.join(e.dirPath, `${num}.json`);
    const emptyPath = path.join(e.dirPath, `${num}.empty_ayahs.json`);
    let ayahCount = null;
    let emptyAyahCount = null;

    if (fs.existsSync(combinedPath)) {
      try {
        const arr = await readJSON(combinedPath);
        ayahCount = Array.isArray(arr) ? arr.length : null;
      } catch {
        ayahCount = null;
      }
    }

    if (fs.existsSync(emptyPath)) {
      try {
        const empty = await readJSON(emptyPath);
        emptyAyahCount = Array.isArray(empty) ? empty.length : null;
      } catch {
        emptyAyahCount = null;
      }
    }

    out.push({
      number: num,
      ayahs_with_tafsir: ayahCount,
      ayahs_without_tafsir: emptyAyahCount,
    });
  }
  return out;
}

/**
 * Returns the full tafsir for one surah as an array of
 * { surah, ayah, text }, sorted by ayah number. Prefers the single
 * combined file (one read); falls back to assembling from the per-ayah
 * folder if only that representation exists.
 */
async function getSurah(slug, surahNumber) {
  const e = getEdition(slug);
  if (!e || !e.surahNumbers.has(surahNumber)) return null;

  const combinedPath = path.join(e.dirPath, `${surahNumber}.json`);
  if (fs.existsSync(combinedPath)) {
    const arr = await readJSON(combinedPath);
    return Array.isArray(arr) ? arr.slice().sort((a, b) => a.ayah - b.ayah) : arr;
  }

  const folderPath = path.join(e.dirPath, String(surahNumber));
  if (fs.existsSync(folderPath)) {
    const files = await fsp.readdir(folderPath);
    const ayahFiles = files
      .filter((f) => AYAH_FILE_RE.test(f))
      .map((f) => ({ number: parseInt(AYAH_FILE_RE.exec(f)[1], 10), file: f }))
      .sort((a, b) => a.number - b.number);
    const entries = [];
    for (const af of ayahFiles) {
      try {
        const data = await readJSON(path.join(folderPath, af.file));
        entries.push(data);
      } catch {
        // skip unreadable/corrupt file rather than failing the whole surah
      }
    }
    return entries;
  }

  return null;
}

/**
 * Returns { has_tafsir: true, ayah entry } for a single ayah, or
 * { has_tafsir: false } when the ayah is known to have no dedicated
 * commentary (very common in this dataset - most ayahs are covered under
 * a nearby ayah's discussion), or null if the surah/ayah is out of range.
 */
async function getAyah(slug, surahNumber, ayahNumber) {
  const e = getEdition(slug);
  if (!e || !e.surahNumbers.has(surahNumber)) return null;

  const surahData = await getSurah(slug, surahNumber);
  if (surahData) {
    const found = surahData.find((a) => a.ayah === ayahNumber);
    if (found) return { has_tafsir: true, ...found };
  }

  const emptyAyahs = await listEmptyAyahs(slug, surahNumber);
  if (emptyAyahs && emptyAyahs.includes(ayahNumber)) {
    return { has_tafsir: false, surah: surahNumber, ayah: ayahNumber };
  }

  return null;
}

async function listEmptyAyahs(slug, surahNumber) {
  const e = getEdition(slug);
  if (!e || !e.surahNumbers.has(surahNumber)) return null;
  const filePath = path.join(e.dirPath, `${surahNumber}.empty_ayahs.json`);
  if (!fs.existsSync(filePath)) return [];
  try {
    const arr = await readJSON(filePath);
    return Array.isArray(arr) ? arr.map((x) => x.ayah) : [];
  } catch {
    return [];
  }
}

/**
 * Iterates every ayah entry of an edition (optionally scoped to one surah),
 * reading each surah's combined file once (cheap) rather than opening many
 * small per-ayah files. Used for search.
 */
async function* iterateAyahs(slug, surahNumber = null) {
  const e = getEdition(slug);
  if (!e) return;
  const numbers = surahNumber !== null ? [surahNumber] : Array.from(e.surahNumbers).sort((a, b) => a - b);
  for (const num of numbers) {
    if (!e.surahNumbers.has(num)) continue;
    let entries;
    try {
      entries = await getSurah(slug, num);
    } catch {
      continue;
    }
    if (!entries) continue;
    for (const entry of entries) {
      yield entry;
    }
  }
}

module.exports = {
  loadRegistry,
  isReady,
  listEditions,
  getEdition,
  listSurahs,
  getSurah,
  getAyah,
  listEmptyAyahs,
  iterateAyahs,
};
