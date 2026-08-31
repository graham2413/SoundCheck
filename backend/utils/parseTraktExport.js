const AdmZip = require("adm-zip");

function normalizeMediaType(rawType) {
  return rawType === "show" ? "tv" : "movie";
}

function safeReadJson(zip, fileName) {
  const entry = zip.getEntry(fileName);
  if (!entry) return [];
  try {
    return JSON.parse(entry.getData().toString("utf8"));
  } catch (error) {
    return [];
  }
}

// Maps a Trakt "ratings-movies.json"/"ratings-shows.json" entry to a normalized row.
function mapRatingEntry(entry) {
  const media = entry.movie || entry.show;
  if (!media) return null;

  return {
    title: media.title,
    year: media.year,
    imdbId: media.ids?.imdb,
    tmdbId: media.ids?.tmdb,
    rating: entry.rating,
    mediaType: normalizeMediaType(entry.type),
    dateAdded: entry.rated_at ? new Date(entry.rated_at) : undefined,
  };
}

// Maps a Trakt "lists-watchlist-*.json" entry to a normalized row (no rating).
function mapWatchlistEntry(entry) {
  const media = entry.movie || entry.show;
  if (!media) return null;

  return {
    title: media.title,
    year: media.year,
    imdbId: media.ids?.imdb,
    tmdbId: media.ids?.tmdb,
    rating: undefined,
    mediaType: normalizeMediaType(entry.type),
    dateAdded: entry.listed_at ? new Date(entry.listed_at) : undefined,
  };
}

// Parses a Trakt data-export zip into a normalized array of import rows.
// Only ratings (movies/shows) and watchlist entries are used - everything else
// in the export (history, collections, episode/season ratings, etc.) is ignored.
function parseTraktExport(zipBuffer) {
  const zip = new AdmZip(zipBuffer);

  const ratingRows = [
    ...safeReadJson(zip, "ratings-movies.json").map(mapRatingEntry),
    ...safeReadJson(zip, "ratings-shows.json").map(mapRatingEntry),
  ];

  const watchlistFiles = zip
    .getEntries()
    .map((entry) => entry.entryName)
    .filter((name) => /^lists-watchlist-\d+\.json$/.test(name));

  const watchlistRows = watchlistFiles.flatMap((fileName) =>
    safeReadJson(zip, fileName).map(mapWatchlistEntry)
  );

  return [...ratingRows, ...watchlistRows].filter((row) => row && row.title);
}

module.exports = { parseTraktExport };
