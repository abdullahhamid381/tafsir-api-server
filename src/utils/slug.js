/**
 * Turns a folder path segment like "Adwa Al Bayan" or a joined
 * "arabic/adwa-al-bayan" into a URL-safe slug.
 */
function toSlug(name) {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

module.exports = { toSlug };
