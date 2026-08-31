const AdmZip = require("adm-zip");
const path = require("path");

function normalizeMediaType(rawType) {
  return rawType === "show" ? "tv" : "movie";
}

// Finds a zip entry by filename regardless of which folder it's nested in -
// Trakt exports aren't always flat at the zip root depending on how the user
// re-zipped/downloaded them.
function findEntryByBasename(zip, fileName) {
  return zip
    .getEntries()
    .find((entry) => path.posix.basename(entry.entryName) === fileName);
}

function safeReadJson(zip, fileName) {
  const entry = findEntryByBasename(zip, fileName);
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
    .map((entry) => path.posix.basename(entry.entryName))
    .filter((name) => /^lists-watchlist(-\d+)?\.json$/.test(name));

  const watchlistRows = watchlistFiles.flatMap((fileName) =>
    safeReadJson(zip, fileName).map(mapWatchlistEntry)
  );

  console.log(
    `Trakt export parse: ${ratingRows.length} rating row(s), ${watchlistFiles.length} watchlist file(s) found (${watchlistRows.length} row(s)).`
  );

  return [...ratingRows, ...watchlistRows].filter((row) => row && row.title);
}

module.exports = { parseTraktExport };
