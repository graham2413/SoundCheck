const normalize = (text) => {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')  // Remove punctuation
    .replace(/\s+/g, ' ')         // Collapse spaces
    .trim();
};

/**
 * Generates a canonical ID string from title + artist.
 * Example: "Oneida - Tyler Childers" => "oneida-tyler childers"
 */
function getCanonicalId(title, artist) {
  if (!title || !artist) return null;
  return `${normalize(title)}-${normalize(artist)}`;
}

/**
 * Generates a canonical ID string from title + release year (Movies/TV).
 * Example: "The Matrix" (1999) => "the matrix-1999"
 */
function getMediaCanonicalId(title, releaseYear) {
  if (!title || !releaseYear) return null;
  return `${normalize(title)}-${releaseYear}`;
}

module.exports = { getCanonicalId, getMediaCanonicalId };