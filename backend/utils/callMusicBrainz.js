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

const MB_BASE = "https://musicbrainz.org/ws/2";
// MusicBrainz's own etiquette rules require a descriptive User-Agent
// identifying the app - unlike TMDb/Deezer this has no API key at all, this
// header is the only thing that identifies the caller.
const USER_AGENT = "SoundCheck-Cinewave/1.0 (soundtrack lookup; contact: dev@example.com)";

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

module.exports = { getSoundtrack };
