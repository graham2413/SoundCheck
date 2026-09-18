// utils/episodeRatingLookup.js
//
// Per-episode IMDb rating lookup, replacing the old bulk title.episode.tsv.gz
// scan (streaming and scanning IMDb's ~9.87M-row raw file per show) with a
// live per-episode TMDb call. Only the resolved tconst is cached (see
// callTmdb.getEpisodeImdbId's sliding 7-day
// TTL) - the rating value itself is always read fresh from the existing
// ImdbRating collection (synced daily by imdbRatingsSync.js), so a cached
// tconst never serves a stale rating.
const { getEpisodeImdbId, getTmdbIdFromImdbId, getTmdbSeasonDetails } = require("./callTmdb");
const ImdbRating = require("../models/ImdbRating");

// Resolves one episode's IMDb tconst via TMDb, then looks up its rating.
// Returns null (rather than throwing) when TMDb has no imdb_id for this
// episode, so callers can skip it instead of failing an entire season.
async function getEpisodeRating(tvId, seasonNumber, episodeNumber) {
  const tconst = await getEpisodeImdbId(tvId, seasonNumber, episodeNumber);
  if (!tconst) return null;

  const rating = await ImdbRating.findById(tconst).lean();
  return {
    tconst,
    seasonNumber,
    episodeNumber,
    averageRating: rating?.averageRating ?? null,
    numVotes: rating?.numVotes ?? null,
  };
}

// Resolves every episode of ONE season (by the show's IMDb parent tconst) to
// its IMDb rating - scoped to a single season, not the whole show, since
// that's what the Episodes tab actually renders at a time and a season's
// episode count (typically well under a few dozen) keeps this fast as one
// batched call. The per-episode TMDb calls this fans out to are individually
// cached (see getEpisodeImdbId's sliding 7-day TTL) and rate-limited/queued
// by callTmdb, so firing them all in parallel here is safe without any
// extra throttling of its own.
async function getSeasonEpisodeRatings(parentTconst, seasonNumber) {
  const tvId = await getTmdbIdFromImdbId(parentTconst);
  if (!tvId) return [];

  const seasonDetails = await getTmdbSeasonDetails(tvId, seasonNumber);
  const seasonEpisodes = seasonDetails?.episodes || [];

  const ratings = await Promise.all(
    seasonEpisodes.map((e) => getEpisodeRating(tvId, seasonNumber, e.episodeNumber))
  );
  return ratings.filter(Boolean);
}

module.exports = { getEpisodeRating, getSeasonEpisodeRatings };
