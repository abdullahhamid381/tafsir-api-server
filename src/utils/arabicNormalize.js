// Arabic tafsir text is fully vocalized (tashkeel/harakat between letters),
// e.g. "اللَّهِ" instead of "الله". A plain substring search for the
// undiacritized query would never match that text, so both the stored text
// and the search query are normalized through this before comparing.
//
// Range covers: combining Arabic diacritics (fatha, damma, kasra, shadda,
// sukun, tanwin, etc.), superscript alef, and tatweel (the elongation dash).
// eslint-disable-next-line no-misleading-character-class
const DIACRITICS_RE = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;

function normalizeArabic(str) {
  if (typeof str !== 'string') return '';
  return str.replace(DIACRITICS_RE, '');
}

module.exports = { normalizeArabic };
