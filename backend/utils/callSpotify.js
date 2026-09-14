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
//
// Held in-process (module-level), not Redis: this only needs to hold across
// requests within a single Node process, not across instances/restarts, same
// reasoning as the existing TMDb/Deezer rate limiters. A token is cheap to
// re-fetch on a cold start, so there's no reason to spend Redis commands on
// something a plain variable already covers for free.
const TOKEN_CACHE_TTL_MS = 50 * 60 * 1000; // 50 minutes
let cachedToken = null;
let cachedTokenExpiresAt = 0;

async function getCachedAppToken() {
  if (cachedToken && Date.now() < cachedTokenExpiresAt) return cachedToken;

  const token = await getSpotifyAccessToken();
  if (token) {
    cachedToken = token;
    cachedTokenExpiresAt = Date.now() + TOKEN_CACHE_TTL_MS;
  }
  return token;
}

function clearCachedAppToken() {
  cachedToken = null;
  cachedTokenExpiresAt = 0;
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
        clearCachedAppToken();
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

// An artist's Spotify ID never changes once resolved - long TTL. Followed
// artists are identified by Deezer id/name in this app; this is the
// name-based bridge into Spotify for the music-calendar's "upcoming" side
// (see mainSearchController.js's getMusicCalendar). Same fuzzy-match risk as
// any name search (two different artists can share a name) - accepted
// tradeoff for actually finding pre-announced future releases, which
// Deezer's own catalog rarely has (see repo notes on the release tracker).
const ARTIST_ID_CACHE_TTL = 30 * 24 * 60 * 60; // 30 days

async function findArtistId(name) {
  const cacheKey = `spotify:artist-id:${name.toLowerCase().trim()}`;
  const cached = await redis.safeGet(cacheKey);
  if (cached) return cached === "null" ? null : cached;

  const token = await getCachedAppToken();
  if (!token) return null;

  try {
    const response = await axios.get(`${API_BASE}/search`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { q: name, type: "artist", limit: 1 },
      timeout: 8000,
    });
    const id = response.data?.artists?.items?.[0]?.id || null;
    await redis.safeSet(cacheKey, id || "null", "EX", ARTIST_ID_CACHE_TTL);
    return id;
  } catch (error) {
    console.error("Spotify artist-search error:", name, error.response?.status, error.message);
    return null;
  }
}

// Shorter TTL than the artist-id cache - an upcoming release's exact date
// can still be adjusted/confirmed after being first announced.
const UPCOMING_ALBUMS_CACHE_TTL = 12 * 60 * 60; // 12 hours

// Real upcoming (future-dated) albums/singles for one artist. Only
// day-precision dates are used (release_date_precision === "day") - a
// pre-announcement with just a year or year-month on record isn't a usable
// calendar entry. Returns [] on any failure, same "degrade quietly" contract
// as getPlaylistTracks.
async function getUpcomingAlbums(spotifyArtistId) {
  const cacheKey = `spotify:upcoming-albums:${spotifyArtistId}`;
  const cached = await redis.safeGet(cacheKey);
  if (cached) return JSON.parse(cached);

  const token = await getCachedAppToken();
  if (!token) return [];

  try {
    const response = await axios.get(`${API_BASE}/artists/${spotifyArtistId}/albums`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { include_groups: "album,single", market: "US", limit: 20 },
      timeout: 8000,
    });

    const todayStr = new Date().toISOString().slice(0, 10);
    const upcoming = (response.data?.items || [])
      .filter((a) => a.release_date_precision === "day" && a.release_date > todayStr)
      .map((a) => ({
        albumId: a.id,
        title: a.name,
        cover: a.images?.[0]?.url || null,
        releaseDate: a.release_date,
        // Spotify's own classification - "album" | "single" | "compilation".
        // (Deezer's synced past releases don't have an equivalent captured
        // yet - see the Release model/syncArtistAlbums TODO.)
        recordType: a.album_type || null,
      }));

    await redis.safeSet(cacheKey, JSON.stringify(upcoming), "EX", UPCOMING_ALBUMS_CACHE_TTL);
    return upcoming;
  } catch (error) {
    console.error("Spotify artist-albums error:", spotifyArtistId, error.response?.status, error.message);
    return [];
  }
}

// Exact-match lookup by ISRC (track) or UPC (album) - the "smart link"
// feature's Spotify half (see mainSearchController.js's getSmartLink).
// Odesli/song.link (the app's prior smart-link provider) deprecated public
// unauthenticated access entirely (confirmed: every call now gets back
// `{"statusCode":401,"code":"PUBLIC_API_ACCESS_DEPRECATED"}`, for both track
// and album URLs), and Songwhip - the other established smart-link service -
// shut down for good in July 2024. Spotify's own search already supports
// exact catalog-code lookups, so this replaces Odesli's role for Spotify
// specifically; see smartLinkProviders.js for the Apple Music/YouTube Music
// equivalents built the same way.
async function findSpotifyLink({ type, isrc, upc, title, artist }) {
  const token = await getCachedAppToken();
  if (!token) return null;

  const externalId = type === "album" ? upc : isrc;

  // Exact-code lookup first when we have one - but different platforms can
  // genuinely register different UPC/ISRC codes for what's still the same
  // release (verified directly: Drake's "Iceman" album has UPC 600574206992
  // on Deezer vs 00600574207005 on Spotify - not a formatting difference,
  // an actual different catalog code), so this isn't a reliable enough
  // signal on its own - falls through to a text search below rather than
  // giving up when it comes back empty.
  if (externalId) {
    const exactMatch = await searchSpotify({ token, type, query: type === "album" ? `upc:${externalId}` : `isrc:${externalId}` });
    if (exactMatch) return exactMatch;
  }

  if (!title || !artist) return null;
  return searchSpotify({ token, type, query: type === "album" ? `album:${title} artist:${artist}` : `track:${title} artist:${artist}` });
}

async function searchSpotify({ token, type, query }) {
  try {
    const response = await axios.get(`${API_BASE}/search`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { q: query, type, limit: 1 },
      timeout: 8000,
    });

    const item = type === "album" ? response.data?.albums?.items?.[0] : response.data?.tracks?.items?.[0];
    return item?.external_urls?.spotify || null;
  } catch (error) {
    console.error("Spotify smart-link search error:", error.response?.status, error.message);
    return null;
  }
}

module.exports = { getPlaylistTracks, findArtistId, getUpcomingAlbums, findSpotifyLink };
