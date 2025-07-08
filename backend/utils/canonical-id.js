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

module.exports = { getCanonicalId };