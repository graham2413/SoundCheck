// utils/smartLinkProviders.js
//
// Apple Music and YouTube Music halves of the "smart link" feature (see
// mainSearchController.js's getSmartLink and callSpotify.js's
// findSpotifyLink for the full background/rationale) - Odesli/song.link and
// Songwhip, the two established third-party services that used to do this
// job, are both gone (Odesli deprecated public unauthenticated access,
// Songwhip shut down for good in July 2024), so this builds the equivalent
// lookups directly against each platform's own free search.
const axios = require("axios");

// Apple's public iTunes Search API - free, keyless, no developer account
// needed (unlike MusicKit, which requires a paid Apple Developer membership
// just to mint a token). Text-matched by title+artist rather than an exact
// catalog code (iTunes Search has no ISRC/UPC lookup), so this is a
// best-effort match, not a guaranteed-exact one like the Spotify half.
async function findAppleMusicLink({ type, title, artist }) {
  if (!title || !artist) return null;

  try {
    const response = await axios.get("https://itunes.apple.com/search", {
      params: {
        term: `${artist} ${title}`,
        entity: type === "album" ? "album" : "song",
        limit: 1,
      },
      timeout: 8000,
    });

    const item = response.data?.results?.[0];
    return item?.trackViewUrl || item?.collectionViewUrl || null;
  } catch (error) {
    console.error("Apple Music smart-link search error:", error.response?.status, error.message);
    return null;
  }
}

// YouTube Data API v3 - free, self-serve API key (Google Cloud Console,
// enable "YouTube Data API v3"), no approval wait like Odesli's allowlist.
// No ISRC/UPC-equivalent lookup either, so also a best-effort title+artist
// text match. Degrades to null (not an error) when YOUTUBE_API_KEY isn't
// configured, same "just omit this platform" contract as a failed match.
async function findYoutubeMusicLink({ title, artist }) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey || !title || !artist) return null;

  try {
    const response = await axios.get("https://www.googleapis.com/youtube/v3/search", {
      params: {
        part: "snippet",
        q: `${artist} ${title}`,
        type: "video",
        videoCategoryId: "10", // Music
        maxResults: 1,
        key: apiKey,
      },
      timeout: 8000,
    });

    const videoId = response.data?.items?.[0]?.id?.videoId;
    return videoId ? `https://music.youtube.com/watch?v=${videoId}` : null;
  } catch (error) {
    console.error("YouTube Music smart-link search error:", error.response?.status, error.message);
    return null;
  }
}

module.exports = { findAppleMusicLink, findYoutubeMusicLink };
