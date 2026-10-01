const express = require('express');
const store = require('../utils/dataStore');
const { normalizeArabic } = require('../utils/arabicNormalize');

const router = express.Router();

function buildSnippet(text) {
  if (typeof text !== 'string') return '';
  return text.length > 220 ? `${text.slice(0, 220)}…` : text;
}

// GET /api/search?edition=adwa-al-bayan&surah=3&q=تأويل&limit=20&offset=0
// `edition` is required so a search never has to scan every edition on disk.
router.get('/search', async (req, res, next) => {
  try {
    const { edition, q } = req.query;
    if (!edition) return res.status(400).json({ error: '`edition` query param is required' });
    if (!q || !q.trim()) return res.status(400).json({ error: '`q` query param is required' });
    if (!store.getEdition(edition)) {
      return res.status(404).json({ error: 'Edition not found' });
    }

    const surahNumber = req.query.surah !== undefined ? parseInt(req.query.surah, 10) : null;
    if (req.query.surah !== undefined && Number.isNaN(surahNumber)) {
      return res.status(400).json({ error: '`surah` must be a number' });
    }

    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const offset = parseInt(req.query.offset, 10) || 0;
    const needle = normalizeArabic(q.trim()).toLowerCase();

    const results = [];
    let skipped = 0;
    let scanned = 0;
    const MAX_SCANNED = 50000; // safety cap for a single request

    for await (const entry of store.iterateAyahs(edition, surahNumber)) {
      scanned += 1;
      if (scanned > MAX_SCANNED) break;
      const text = entry.text || '';
      const normalizedText = normalizeArabic(text).toLowerCase();
      if (!normalizedText.includes(needle)) continue;
      if (skipped < offset) {
        skipped += 1;
        continue;
      }
      results.push({
        edition,
        surah: entry.surah,
        ayah: entry.ayah,
        snippet: buildSnippet(text),
      });
      if (results.length >= limit) break;
    }

    res.json({ edition, surah: surahNumber, q, limit, offset, count: results.length, results });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
