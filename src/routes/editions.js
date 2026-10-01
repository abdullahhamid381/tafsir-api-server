const express = require('express');
const store = require('../utils/dataStore');

const router = express.Router();

function parseIntParam(value, res, label) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) {
    res.status(400).json({ error: `${label} must be a number` });
    return null;
  }
  return n;
}

// GET /api/editions
router.get('/editions', (req, res) => {
  res.json({ editions: store.listEditions() });
});

// GET /api/editions/:slug
router.get('/editions/:slug', (req, res) => {
  const e = store.getEdition(req.params.slug);
  if (!e) return res.status(404).json({ error: 'Edition not found' });
  res.json({
    slug: req.params.slug,
    name: e.name,
    group: e.group || null,
    total_surahs: e.surahNumbers.size,
  });
});

// GET /api/editions/:slug/surahs
router.get('/editions/:slug/surahs', async (req, res, next) => {
  try {
    const surahs = await store.listSurahs(req.params.slug);
    if (surahs === null) return res.status(404).json({ error: 'Edition not found' });
    res.json({ edition: req.params.slug, surahs });
  } catch (err) {
    next(err);
  }
});

// GET /api/editions/:slug/surahs/:surahNumber
router.get('/editions/:slug/surahs/:surahNumber', async (req, res, next) => {
  try {
    const surahNumber = parseIntParam(req.params.surahNumber, res, 'surahNumber');
    if (surahNumber === null) return;

    const ayahs = await store.getSurah(req.params.slug, surahNumber);
    if (ayahs === null) {
      const e = store.getEdition(req.params.slug);
      if (!e) return res.status(404).json({ error: 'Edition not found' });
      return res.status(404).json({ error: 'No tafsir data for this surah in this edition' });
    }
    res.json({ edition: req.params.slug, surah: surahNumber, ayahs });
  } catch (err) {
    next(err);
  }
});

// GET /api/editions/:slug/surahs/:surahNumber/ayahs/:ayahNumber
router.get('/editions/:slug/surahs/:surahNumber/ayahs/:ayahNumber', async (req, res, next) => {
  try {
    const surahNumber = parseIntParam(req.params.surahNumber, res, 'surahNumber');
    if (surahNumber === null) return;
    const ayahNumber = parseIntParam(req.params.ayahNumber, res, 'ayahNumber');
    if (ayahNumber === null) return;

    const result = await store.getAyah(req.params.slug, surahNumber, ayahNumber);
    if (result === null) {
      const e = store.getEdition(req.params.slug);
      if (!e) return res.status(404).json({ error: 'Edition not found' });
      return res.status(404).json({ error: 'Surah/ayah not found in this edition' });
    }
    res.json({ edition: req.params.slug, ...result });
  } catch (err) {
    next(err);
  }
});

// GET /api/editions/:slug/surahs/:surahNumber/empty-ayahs
// Ayah numbers that have no dedicated tafsir entry in this edition/surah
// (their commentary is folded into a nearby ayah's text, or simply absent).
router.get('/editions/:slug/surahs/:surahNumber/empty-ayahs', async (req, res, next) => {
  try {
    const surahNumber = parseIntParam(req.params.surahNumber, res, 'surahNumber');
    if (surahNumber === null) return;

    const ayahs = await store.listEmptyAyahs(req.params.slug, surahNumber);
    if (ayahs === null) {
      const e = store.getEdition(req.params.slug);
      if (!e) return res.status(404).json({ error: 'Edition not found' });
      return res.status(404).json({ error: 'Surah not found in this edition' });
    }
    res.json({ edition: req.params.slug, surah: surahNumber, empty_ayahs: ayahs });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
