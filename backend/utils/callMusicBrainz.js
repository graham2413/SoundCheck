// utils/callMusicBrainz.js
//
// Free, keyless soundtrack lookup - MusicBrainz release groups can carry an
// "IMDb" URL relationship pointing straight at a movie/show's IMDb title
// page, so a title's real IMDb tconst (already the app's canonical cinema
// identifier) resolves directly to any officially-released "Soundtrack"-type
// release group MusicBrainz has for it, and from there to a real per-track
// title/artist listing.
//
// Coverage is intentionally narrower than a paid placement API (Tunefind/
// WhatSong): this only ever finds songs/score that made it onto an actual
// released soundtrack/score album, never a one-off scene needle-drop that
// was never released as a record, and TV is series-level only - MusicBrainz
// has no relationship type linking a release group to an individual episode.
const axios = require("axios");
const redis = require("./redisClient");

const MB_BASE = "https://musicbrainz.org/ws/2";
// MusicBrainz's own etiquette rules require a descriptive User-Agent
// identifying the app - unlike TMDb/Deezer this has no API key at all, this
// header is the only thing that identifies the caller.
const USER_AGENT = "SoundCheck-Cinewave/1.0 (soundtrack + artist release lookup; contact: dev@example.com)";

// MusicBrainz asks unauthenticated callers to stay at ~1 request/second.
// A single soundtrack lookup already makes several *sequential* calls of its
// own (url -> release-group -> release), so this is a simple serialized
// queue (not a sliding window like TMDb/Deezer use) - one shared timestamp
// gates every call, cold lookups just take a few seconds the first time.
const REQUEST_INTERVAL_MS = 1100; // small buffer over the stated 1 req/sec
let lastRequestAt = 0;

async function waitForSlot() {
  const wait = lastRequestAt + REQUEST_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
}

// MusicBrainz's public server returns a plain 503 "currently busy" fairly
// often even for simple unrelated lookups (confirmed by direct testing, not
// specific to any one query) - a few retries with backoff routinely gets
// through a transient busy window.
const MAX_ATTEMPTS = 4;

async function callMusicBrainz(path, params = {}) {
  await waitForSlot();

  let attempt = 0;
  while (attempt < MAX_ATTEMPTS) {
    try {
      const response = await axios.get(`${MB_BASE}${path}`, {
        params: { ...params, fmt: "json" },
        timeout: 8000,
        headers: { "User-Agent": USER_AGENT },
      });
      return response.data;
    } catch (error) {
      const status = error.response?.status;
      if (status === 404) return null; // genuinely doesn't exist, not worth retrying

      console.error(`MusicBrainz API error [${attempt + 1}/3]:`, path, status, error.message);

      // Client errors other than 429 (rate limited) will never succeed on retry.
      if (status && status !== 429 && status < 500) return null;

      await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000));
      attempt++;
    }
  }

  console.error(`All ${MAX_ATTEMPTS} MusicBrainz attempts failed for ${path}`);
  return null;
}

// A title can have more than one release group linked (e.g. a show with a
// separate score album per season, or a movie with both a score and a
// separate songs compilation) - capped so one unusual title can't balloon a
// lookup into dozens of sequential MusicBrainz calls.
const MAX_RELEASE_GROUPS = 3;
const MAX_TRACKS = 60;

// Finds every release group MusicBrainz has linked to this exact IMDb title
// page via the "IMDb" release-group-url relationship - per MusicBrainz's own
// relationship-type docs, this relationship exists specifically to link a
// *soundtrack* release group to its movie/show's IMDb page, so no further
// client-side type check is needed (nor would one be reliable: the
// release-group object embedded in this relationship response is a stub with
// empty primary-type/secondary-types - real type data only comes back from a
// direct /release-group/:id lookup, which getBestReleaseId below does anyway).
async function findSoundtrackReleaseGroups(imdbId) {
  const resource = `https://www.imdb.com/title/${imdbId}/`;
  const data = await callMusicBrainz("/url", { resource, inc: "release-group-rels" });
  if (!data) return [];

  const relations = data.relations || [];
  return relations
    .filter((r) => r.type === "IMDb" && r["target-type"] === "release_group" && r["release_group"])
    .map((r) => r["release_group"])
    .slice(0, MAX_RELEASE_GROUPS);
}

// Picks one representative release from a release-group's releases - prefers
// an "Official" release (MusicBrainz also tracks bootlegs/promos) so the
// tracklist reflects the real retail album, not an unofficial pressing.
async function getBestReleaseId(releaseGroupId) {
  const data = await callMusicBrainz(`/release-group/${releaseGroupId}`, { inc: "releases" });
  const releases = data?.releases || [];
  const official = releases.find((r) => r.status === "Official") || releases[0];
  return official?.id || null;
}

// Real per-track title + artist listing for one release.
async function getReleaseTracks(releaseId) {
  const data = await callMusicBrainz(`/release/${releaseId}`, { inc: "recordings+artist-credits" });
  const media = data?.media || [];

  const tracks = [];
  for (const medium of media) {
    for (const track of medium.tracks || []) {
      const title = track.title || track.recording?.title;
      if (!title) continue;
      const artist =
        (track["artist-credit"] || []).map((ac) => ac.name || ac.artist?.name).filter(Boolean).join(" & ") || null;
      const durationMs = track.length ?? track.recording?.length ?? null;
      tracks.push({ title, artist, durationMs });
    }
  }
  return tracks;
}

// De-dupes by lowercased title+artist so the same song showing up across
// e.g. a "Vol. 1"/"Vol. 2" release pair only shows once.
function dedupeTracks(tracks) {
  const seen = new Set();
  const result = [];
  for (const t of tracks) {
    const key = `${t.title.toLowerCase()}::${(t.artist || "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(t);
    if (result.length >= MAX_TRACKS) break;
  }
  return result;
}

// Real, IMDb-linked, officially-released soundtrack/score tracks for one
// movie or TV series (series-level only for TV; MusicBrainz has no per-
// episode relationship). Uncached - see utils/soundtrackProvider.js, which
// caches this alongside the SoundtrackDB/Spotify path under one combined key.
async function getSoundtrack(imdbId) {
  const releaseGroups = await findSoundtrackReleaseGroups(imdbId);
  if (!releaseGroups.length) return { available: false, tracks: [] };

  const allTracks = [];
  for (const rg of releaseGroups) {
    const releaseId = await getBestReleaseId(rg.id);
    if (!releaseId) continue;
    allTracks.push(...(await getReleaseTracks(releaseId)));
  }

  const tracks = dedupeTracks(allTracks);
  return tracks.length ? { available: true, tracks } : { available: false, tracks: [] };
}

// Long-TTL like callSpotify.js's findArtistId (an artist's MBID never
// changes once resolved) - a Deezer artist id is a stable, precise key to
// search MusicBrainz by, PROVIDED MusicBrainz has that Deezer artist page
// logged as a URL relationship. That coverage is community-entered and
// inconsistent, so this falls back to a fuzzy name search (same "two
// artists can share a name" tradeoff callSpotify.js's own findArtistId
// already accepts) when the precise lookup misses.
const ARTIST_ID_CACHE_TTL = 30 * 24 * 60 * 60; // 30 days

async function resolveArtistMbid(deezerArtistId, artistName) {
  const cacheKey = `musicbrainz:artist-mbid:${deezerArtistId}`;
  const cached = await redis.safeGet(cacheKey);
  if (cached) return cached === "null" ? null : cached;

  let mbid = await resolveArtistMbidByDeezerUrl(deezerArtistId);
  if (!mbid) mbid = await resolveArtistMbidByName(artistName);

  await redis.safeSet(cacheKey, mbid || "null", "EX", ARTIST_ID_CACHE_TTL);
  return mbid;
}

// Deezer artist pages have been seen logged under both the bare and
// locale-prefixed URL shape ("/artist/{id}" and "/en/artist/{id}") - a miss
// on one is cheap since callMusicBrainz already returns null instead of
// throwing on a 404, so trying both costs at most one extra rate-limited call.
async function resolveArtistMbidByDeezerUrl(deezerArtistId) {
  const candidateUrls = [
    `https://www.deezer.com/artist/${deezerArtistId}`,
    `https://www.deezer.com/en/artist/${deezerArtistId}`,
  ];
  for (const resource of candidateUrls) {
    const data = await callMusicBrainz("/url", { resource, inc: "artist-rels" });
    const relations = data?.relations || [];
    const artistRel = relations.find((r) => r["target-type"] === "artist" && r.artist?.id);
    if (artistRel) return artistRel.artist.id;
  }
  return null;
}

// Fuzzy fallback - picks the first search result only, no attempt at
// cross-referencing genre/country to disambiguate two same-named artists.
async function resolveArtistMbidByName(artistName) {
  const data = await callMusicBrainz("/artist", { query: artistName, limit: 1 });
  return data?.artists?.[0]?.id || null;
}

// Shorter TTL like callSpotify.js's getUpcomingAlbums - an upcoming date can
// still be revised after first appearing on MusicBrainz.
const UPCOMING_RELEASE_GROUPS_CACHE_TTL = 12 * 60 * 60; // 12 hours

// The Cover Art Archive (archive.org-backed, tightly integrated with
// MusicBrainz but a genuinely separate service/host) hosts real cover art
// for a meaningful share of release groups - including pre-release ones,
// confirmed by direct testing (e.g. Kings of Leon's unreleased "O My
// Beloved" already has front art registered). Its own convenience redirect
// (`/release-group/:mbid/front-{size}`) 404s cleanly when nothing's
// registered, so a plain existence check is all that's needed - no JSON
// parsing required, the same URL doubles as the final <img src>.
// Cached alongside the release-group list itself (same TTL) since it's
// checked once per candidate release, not on every calendar page load.
async function resolveCoverArtUrl(releaseGroupMbid) {
  const cacheKey = `musicbrainz:cover-art:${releaseGroupMbid}`;
  const cached = await redis.safeGet(cacheKey);
  if (cached) return cached === "null" ? null : cached;

  const url = `https://coverartarchive.org/release-group/${releaseGroupMbid}/front-500`;
  let resolved = null;
  try {
    // HEAD only - confirming existence, not downloading the image. Not
    // routed through callMusicBrainz/waitForSlot: this hits archive.org, not
    // musicbrainz.org, so MusicBrainz's 1 req/sec etiquette doesn't apply.
    await axios.head(url, { timeout: 8000 });
    resolved = url;
  } catch (error) {
    // 404 (no art registered for this release group) is the common, expected
    // case - not worth logging as an error.
    if (error.response?.status !== 404) {
      console.error(`Cover Art Archive lookup failed for ${releaseGroupMbid}:`, error.response?.status, error.message);
    }
  }

  await redis.safeSet(cacheKey, resolved || "null", "EX", UPCOMING_RELEASE_GROUPS_CACHE_TTL);
  return resolved;
}

// Reuses the same getBestReleaseId -> getReleaseTracks chain the soundtrack
// feature already uses, just against a music release-group instead of a
// soundtrack one linked via IMDb. Coverage isn't guaranteed pre-release -
// depends on whether a label/editor entered the full tracklist ahead of
// time (common for pre-order campaigns, far from universal) - confirmed
// directly working today for Kings of Leon's unreleased "O My Beloved"
// (13 real tracks with durations, released ~7 weeks out). Cached alongside
// the release-groups list itself since it's resolved once per candidate.
async function getReleaseGroupTracklist(releaseGroupId) {
  const cacheKey = `musicbrainz:tracklist:${releaseGroupId}`;
  const cached = await redis.safeGet(cacheKey);
  if (cached) return JSON.parse(cached);

  const releaseId = await getBestReleaseId(releaseGroupId);
  const tracks = releaseId ? await getReleaseTracks(releaseId) : [];

  await redis.safeSet(cacheKey, JSON.stringify(tracks), "EX", UPCOMING_RELEASE_GROUPS_CACHE_TTL);
  return tracks;
}

// Real upcoming (future first-release-date) albums/singles for one resolved
// MBID. Mirrors callSpotify.js's getUpcomingAlbums contract: day-precision
// dates only, future-dated only, [] on any failure (degrade quietly).
async function getUpcomingReleaseGroups(mbid) {
  const cacheKey = `musicbrainz:upcoming-release-groups:${mbid}`;
  const cached = await redis.safeGet(cacheKey);
  if (cached) return JSON.parse(cached);

  const data = await callMusicBrainz("/release-group", {
    artist: mbid,
    type: "album|single",
    limit: 25,
  });

  const todayStr = new Date().toISOString().slice(0, 10);
  const futureGroups = (data?.["release-groups"] || []).filter((rg) => {
    const date = rg["first-release-date"];
    // Day-precision only ("YYYY-MM-DD", 10 chars) - a bare year or
    // year-month isn't a usable calendar entry, same reasoning as
    // Spotify's release_date_precision === "day" filter.
    return date && date.length === 10 && date > todayStr;
  });

  // Typically 0-2 candidates per artist at this point (already date-
  // filtered), so resolving cover art for each in parallel is cheap and
  // doesn't need the batching cronSyncAllArtists uses for larger fan-outs.
  const upcoming = await Promise.all(
    futureGroups.map(async (rg) => ({
      sourceId: rg.id,
      title: rg.title,
      cover: await resolveCoverArtUrl(rg.id),
      tracklist: await getReleaseGroupTracklist(rg.id),
      releaseDate: rg["first-release-date"],
      // Lowercased - MusicBrainz's own primary-type vocabulary is
      // capitalized ("Album"/"Single"/"EP"), but every other recordType
      // consumer in this app (Deezer/Spotify's record_type/album_type, the
      // frontend's musicTypeLabel switch and calendar badge check) expects
      // lowercase - left as-is this silently fell through to a generic
      // "Release" label/icon for every MusicBrainz-sourced upcoming release.
      recordType: rg["primary-type"] ? rg["primary-type"].toLowerCase() : null,
    }))
  );

  await redis.safeSet(cacheKey, JSON.stringify(upcoming), "EX", UPCOMING_RELEASE_GROUPS_CACHE_TTL);
  return upcoming;
}

module.exports = { getSoundtrack, resolveArtistMbid, getUpcomingReleaseGroups, getReleaseGroupTracklist };
