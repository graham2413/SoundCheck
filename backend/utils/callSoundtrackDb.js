// utils/callSoundtrackDb.js
//
// SoundtrackDB (soundtrackdb.vercel.app) - a free, keyless, solo-dev side
// project that maps a title to a community/official Spotify PLAYLIST for
// that movie/show. It does NOT expose individual songs - see
// utils/callSpotify.js for the second hop that actually unpacks the playlist
// into a real track list.
//
// This only ever supplies a `playlist_id` - the API's own docs confirm the
// `music` array's shape is `{ platform, type: "playlist", playlist_id, url,
// source, verified, confidence, match_type }`, nothing per-track.
//
// Uses /v1/titles/resolve (title/year/type search), not the IMDb-keyed
// /v1/titles/imdb/:id/music - directly verified the two behave differently:
// the IMDb-keyed route only ever returns ONE candidate and, for a title it
// hasn't fully catalogued an imdb_id for yet, silently re-resolves on the
// fly on each call (confirmed live - the same IMDb id returned two different
// playlists, 73 tracks vs 10, a few minutes apart). /resolve instead returns
// every candidate it has on record with a `confidence` score, letting us
// pick the best one ourselves instead of trusting whichever single answer
// its on-demand path happened to produce that moment.
const axios = require("axios");

const BASE_URL = "https://soundtrackdb.vercel.app";
const TIMEOUT_MS = 8000;

async function callSoundtrackDb(path) {
  let attempt = 0;
  while (attempt < 2) {
    try {
      const response = await axios.get(`${BASE_URL}${path}`, { timeout: TIMEOUT_MS });
      return response.data;
    } catch (error) {
      const status = error.response?.status;
      // Any 4xx (title not found, invalid id format, etc.) will never
      // succeed on retry - only a 5xx/network hiccup is worth one retry.
      if (status && status < 500) return null;

      console.error(`SoundtrackDB error [${attempt + 1}/2]:`, path, status, error.message);
      attempt++;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  return null;
}

// Highest-`confidence` Spotify playlist candidate SoundtrackDB has on record
// for this title, resolved by title/year/type - not sorted-order-dependent,
// picks the max explicitly. Returns null if it has nothing (most titles,
// given the catalog's small/growing size - the common case, not an error).
async function getSpotifyPlaylistId({ title, year, mediaType }) {
  if (!title) return null;

  const params = new URLSearchParams({ title });
  if (year) params.set("year", String(year));
  if (mediaType) params.set("type", mediaType);

  const data = await callSoundtrackDb(`/v1/titles/resolve?${params.toString()}`);
  if (!data?.success) return null;

  const candidates = (data.music || []).filter((m) => m.platform === "spotify" && m.type === "playlist" && m.playlist_id);
  if (!candidates.length) return null;

  const best = candidates.reduce((a, b) => (b.confidence > a.confidence ? b : a));
  return best.playlist_id;
}

module.exports = { getSpotifyPlaylistId };
