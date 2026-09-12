// utils/callSpotify.js
//
// Official, documented Spotify Web API access (Client Credentials flow -
// app-only, read-only, no user login) - the second hop for the soundtrack
// feature: SoundtrackDB only ever hands back a playlist ID (see
// utils/callSoundtrackDb.js), this is what actually unpacks that playlist
// into a real per-track title/artist listing.
//
// Deliberately NOT using SoundtrackDB's own documented `/api/token` endpoint
// (an "anonymous web-player token rotated via TOTP") - that's a reverse-
// engineered credential for Spotify's internal web-player API, not a
// legitimate third-party grant, and fragile/ToS-risky besides. This uses our
// own registered Spotify Developer app credentials via Spotify's normal,
// supported flow instead - the exact same trust tier as the app's existing
// TMDb/OMDb/Deezer integrations.
const axios = require("axios");
const redis = require("./redisClient");
const getSpotifyAccessToken = require("../auth/spotifyAuth");

const API_BASE = "https://api.spotify.com/v1";

// Client Credentials tokens are valid ~1 hour - cached with a safety margin
// so a request never has to wait on a fresh token fetch on the common path,
// and never risks using one Spotify itself has already expired.
const TOKEN_CACHE_TTL = 50 * 60; // 50 minutes
const TOKEN_CACHE_KEY = "spotify:app-token";

async function getCachedAppToken() {
  const cached = await redis.safeGet(TOKEN_CACHE_KEY);
  if (cached) return cached;

  const token = await getSpotifyAccessToken();
  if (token) await redis.safeSet(TOKEN_CACHE_KEY, token, "EX", TOKEN_CACHE_TTL);
  return token;
}

// A community-curated playlist can run long - capped so one unusually large
// playlist can't turn a single title's soundtrack lookup into dozens of
// paginated Spotify calls. 100/page x 2 pages comfortably covers the vast
// majority of movie/show soundtrack playlists in one or two requests.
const MAX_TRACKS = 100;
const PAGE_LIMIT = 100;

// Real per-track title + artist listing for one Spotify playlist. Returns []
// (not null) on any failure - a broken/unresolvable playlist ID should fall
// back to MusicBrainz, not surface as a hard error (see soundtrackProvider.js).
async function getPlaylistTracks(playlistId) {
  const token = await getCachedAppToken();
  if (!token) return [];

  const tracks = [];
  let url = `${API_BASE}/playlists/${playlistId}/tracks?fields=items(track(name,artists(name),duration_ms)),next&limit=${PAGE_LIMIT}`;
  let attempt = 0;

  while (url && tracks.length < MAX_TRACKS) {
    try {
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 8000,
      });

      const items = response.data?.items || [];
      for (const item of items) {
        const track = item?.track;
        // Removed/unavailable tracks and local (non-catalog) files come back
        // as null or missing artist data - skip rather than show a blank row.
        if (!track?.name) continue;
        const artist = (track.artists || []).map((a) => a.name).filter(Boolean).join(" & ") || null;
        tracks.push({ title: track.name, artist, durationMs: track.duration_ms ?? null });
        if (tracks.length >= MAX_TRACKS) break;
      }

      url = response.data?.next || null;
    } catch (error) {
      const status = error.response?.status;
      // Expired/invalid cached token - clear it and retry once with a fresh one.
      if (status === 401 && attempt === 0) {
        await redis.safeDel(TOKEN_CACHE_KEY);
        const freshToken = await getCachedAppToken();
        if (!freshToken) return tracks;
        attempt++;
        continue;
      }
      console.error("Spotify playlist-tracks error:", playlistId, status, error.message);
      break;
    }
  }

  return tracks;
}

module.exports = { getPlaylistTracks };
