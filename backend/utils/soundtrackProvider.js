// utils/soundtrackProvider.js
//
// Single entry point for the soundtrack feature - tries SoundtrackDB (a
// title's Spotify playlist, unpacked into real tracks via Spotify's own Web
// API) first, falls back to MusicBrainz (officially-released soundtrack/
// score albums) if that comes up empty. Both sources already normalize down
// to the same { title, artist }[] shape, so the rest of the app (the
// endpoint, the frontend model/component, the click-through Deezer resolve)
// never needs to know which one actually answered.
//
// One combined cache here (not one per source) - per the "cache only, no
// Mongo" decision, a single Redis entry per title covers whichever path
// answered, so a title that fell through to MusicBrainz isn't re-trying
// SoundtrackDB again until the whole entry expires.
const redis = require("./redisClient");
const { getSpotifyPlaylistId } = require("./callSoundtrackDb");
const { getPlaylistTracks } = require("./callSpotify");
const { getSoundtrack: getMusicBrainzSoundtrack } = require("./callMusicBrainz");

const SETTLED_TTL = 14 * 24 * 60 * 60; // 2 weeks - a settled title's soundtrack essentially never changes
// A brand-new release's SoundtrackDB catalog entry can still be actively
// resolved/edited by their auto-ingest + community process for a while after
// launch (confirmed directly - the same title's answer changed underneath us
// within minutes during testing) - a much shorter TTL lets a recent title
// naturally re-check and converge toward a stable answer instead of locking
// in whatever happened to exist on day one for a full 2 weeks.
const RECENT_RELEASE_TTL = 3 * 24 * 60 * 60; // 3 days
const RECENT_RELEASE_WINDOW_DAYS = 60;

function resolveCacheTtl(releaseDate) {
  if (!releaseDate) return SETTLED_TTL;
  const parsed = new Date(releaseDate);
  if (Number.isNaN(parsed.getTime())) return SETTLED_TTL;

  const daysSinceRelease = (Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceRelease <= RECENT_RELEASE_WINDOW_DAYS ? RECENT_RELEASE_TTL : SETTLED_TTL;
}

async function fetchFromSoundtrackDb({ title, year, mediaType }) {
  const playlistId = await getSpotifyPlaylistId({ title, year, mediaType }).catch((err) => {
    console.error("SoundtrackDB lookup failed:", title, err.message);
    return null;
  });
  if (!playlistId) return null;

  const tracks = await getPlaylistTracks(playlistId).catch((err) => {
    console.error("Spotify playlist fetch failed:", playlistId, err.message);
    return [];
  });
  if (!tracks.length) return null;

  return { tracks, playlistUrl: `https://open.spotify.com/playlist/${playlistId}` };
}

// `source` tells the frontend which provider actually answered (both are
// shown identically today, but this leaves room for source-specific copy
// later, and is useful for debugging coverage gaps). `playlistUrl` is only
// ever set for the SoundtrackDB path (MusicBrainz has no equivalent link to
// send the user to) - lets the frontend's Spotify badge open the real
// playlist instead of just labeling the source.
// `title`/`year`/`mediaType` (the same fields getCinemaDetail already
// resolves) drive the SoundtrackDB lookup - it's title-search based, not
// IMDb-keyed (see callSoundtrackDb.js for why). `releaseDate` only affects
// the cache TTL, never whether/how the lookup itself runs. imdbId stays the
// cache key since it's the app's stable canonical identifier regardless of
// which provider answers.
async function getSoundtrack(imdbId, { title, year, mediaType, releaseDate } = {}) {
  // v4: added per-track durationMs (for the track-count/total-runtime
  // banner) - bumped so entries cached before that field existed are
  // refetched instead of shown without it until their old TTL expires.
  const cacheKey = `soundtrack:v4:${imdbId}`;
  const cached = await redis.safeGet(cacheKey);
  if (cached) return JSON.parse(cached);

  let result;

  const soundtrackDb = await fetchFromSoundtrackDb({ title, year, mediaType });
  if (soundtrackDb) {
    result = { available: true, tracks: soundtrackDb.tracks, source: "soundtrackdb", playlistUrl: soundtrackDb.playlistUrl };
  } else {
    const mb = await getMusicBrainzSoundtrack(imdbId).catch((err) => {
      console.error("MusicBrainz lookup failed:", imdbId, err.message);
      return { available: false, tracks: [] };
    });
    result = { ...mb, source: mb.available ? "musicbrainz" : null, playlistUrl: null };
  }

  await redis.safeSet(cacheKey, JSON.stringify(result), "EX", resolveCacheTtl(releaseDate));
  return result;
}

module.exports = { getSoundtrack };
