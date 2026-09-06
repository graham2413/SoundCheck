const axios = require("axios");
const User = require("../models/User");
const AlbumImage = require("../models/AlbumImage");
const path = require("path");
const https = require("https");
const fs = require("fs");
const { callDeezer, getAlbumGenre } = require("../controllers/mainSearchController");
const { fetchWithRetry } = require("../utils/fetchWithRetry");

const isProd = process.env.NODE_ENV === "production";
const httpsAgent = isProd
  ? new https.Agent()
  : new https.Agent({
    ca: fs.existsSync(path.resolve(__dirname, "../cacert.pem")) ? fs.readFileSync(path.resolve(__dirname, "../cacert.pem")) : undefined
    });

// Classifies a release by track count: 1 = Song, 2-6 = EP, 7+ = Album
function getReleaseType(trackCount) {
  if (trackCount === 1) return "Song";
  if (trackCount <= 6) return "EP";
  return "Album";
}

// Fetch a user's Spotify playlists.
const getUserPlaylists = async (req, res) => {
  try {
    const user = await User.findById(req.user._id); // Ensure latest user data

    if (!user || !user.spotifyAccessToken) {
      return res.status(401).json({ message: "Spotify account not linked" });
    }

    // Fetch user's playlists from Spotify API
    const response = await axios.get(
      "https://api.spotify.com/v1/me/playlists",
      {
        headers: {
          Authorization: `Bearer ${user.spotifyAccessToken}`,
          httpsAgent: httpsAgent,
        },
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error(
      "Error fetching Spotify playlists:",
      error.response?.data || error.message
    );
    res.status(500).json({ message: "Failed to fetch playlists" });
  }
};

// Fetches songs on each provided playlist (add func. to import into the database if not there.)
const importPlaylists = async (req, res) => {
  try {
    const { playlistIds } = req.body; // List of selected Spotify playlist IDs
    const user = await User.findById(req.user._id); // Fetch user

    if (!user || !user.spotifyAccessToken) {
      return res.status(401).json({ message: "Spotify account not linked" });
    }

    const importedSongs = [];

    // Loop through each playlist and fetch its tracks
    for (const playlistId of playlistIds) {
      const response = await axios.get(
        `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
        {
          headers: { Authorization: `Bearer ${user.spotifyAccessToken}` },
          httpsAgent: httpsAgent,
        }
      );

      // Extract and store track details
      response.data.items.forEach((item) => {
        if (!item.track) return; // Handle missing tracks

        importedSongs.push({
          spotifyId: item.track.id,
          name: item.track.name,
          artist: item.track.artists.map((artist) => artist.name).join(", "),
          album: item.track.album.name,
          image: item.track.album.images[0]?.url || "",
        });
      });
    }

    res.json({ importedSongs });
  } catch (error) {
    console.error("Error importing playlists:", error.response?.data || error);
    res.status(500).json({ message: "Failed to import playlists" });
  }
};

// Fetch top albums from Apple Music's official charts and store them in the
// database (runs once a week). Previously did its own from-scratch "trending"
// approximation via Spotify search+new-releases+artist-popularity heuristics
// (very complex, many hundreds of API calls). Apple's Marketing Tools RSS
// feed is a free, unauthenticated, officially-maintained real chart (no API
// key, no rate limit found in practice) that's already ranked and regional -
// so this just consumes it directly instead of re-deriving a "top albums"
// ranking ourselves. Deezer is still used for cover art/preview/track-count
// (same as before), just matching against Apple's title+artist instead.
const setAlbumImages = async () => {
  try {
    // Exact-matched against the Deezer album genre name
    const DEEZER_GENRE_BLOCKLIST = [
      "films/games", "brazilian music", "unknown", "asian music", "latin music", "traditional mexicano", "electro", "banda/grupero", "classical",
      "Indian Music"
    ];

    const TARGET_COUNT = 110;
    // Apple's chart mixes in still-popular older albums alongside new ones -
    // restrict to the last 6 months so "top new music" stays true to its name.
    const NEW_RELEASE_CUTOFF_MONTHS = 6;
    const APPLE_CHART_LIMIT = 100; // 100 is the real max - 150+ 500s in testing
    const APPLE_CHART_URL = `https://rss.marketingtools.apple.com/api/v2/us/music/most-played/${APPLE_CHART_LIMIT}/albums.json`;

    const appleRes = await axios.get(APPLE_CHART_URL, { httpsAgent });
    const appleAlbums = appleRes.data?.feed?.results || [];
    if (appleAlbums.length === 0) {
      console.error("Apple Music charts returned no results.");
      return false;
    }

    const releaseCutoff = new Date();
    releaseCutoff.setMonth(releaseCutoff.getMonth() - NEW_RELEASE_CUTOFF_MONTHS);

    // Already ranked by Apple (index 0 = #1) - keep that order, just filter to recent releases.
    const candidatePool = appleAlbums
      .filter((album) => new Date(album.releaseDate || 0).getTime() >= releaseCutoff.getTime())
      .map((album, index) => ({
        name: album.name,
        artists: [{ id: album.artistId, name: album.artistName }],
        release_date: album.releaseDate,
        // Synthetic popularity from chart rank (rank 1 = highest)
        applePopularity: Math.max(0, appleAlbums.length - index),
      }));

    console.log(`Apple Music charts: ${appleAlbums.length} raw -> ${candidatePool.length} within last ${NEW_RELEASE_CUTOFF_MONTHS} months`);

    console.log(`Ranked candidate pool: ${candidatePool.length} albums, walking down for Deezer matches...`);

    const finalAlbumsMap = new Map(); // id -> album, filled in ranked order until TARGET_COUNT

    // Phase 3: walk down the ranked pool, Deezer-matching until we hit the target
    // Processed in small batches (not all-at-once) to avoid hammering the shared Deezer rate limiter
    const DEEZER_BATCH_SIZE = 5;
    for (let i = 0; i < candidatePool.length; i += DEEZER_BATCH_SIZE) {
      if (finalAlbumsMap.size >= TARGET_COUNT) break;

      const batch = candidatePool.slice(i, i + DEEZER_BATCH_SIZE);

      await Promise.all(
        batch.map(async (album) => {
          if (finalAlbumsMap.size >= TARGET_COUNT) return;

          const name = album.name;
          const artistName = album.artists.map((a) => a.name).join(", ");
          const releaseDate = album.release_date || "0000-00-00";
          const maxPopularity = album.applePopularity;

          try {
            // Deezer titles don't include feature credits, and its search relevance
            // handles a single clean artist name better than a comma-joined list
            const nameForDeezerQuery = name.replace(/\s*[([](feat\.?|with)\s+[^)\]]+[)\]]/gi, "").trim();
            const primaryArtistName = album.artists[0]?.name || artistName;

            const deezerSearchRes = await fetchWithRetry(() =>
              callDeezer(
                `https://api.deezer.com/search/album?q=${encodeURIComponent(`${nameForDeezerQuery} ${primaryArtistName}`)}`
              )
            );

            const normalize = (str) =>
              str
                .toLowerCase()
                .replace(/[^a-z0-9\s]/g, "") // strip punctuation (parens, dashes, etc.)
                .replace(/\s+/g, " ")
                .trim();

            const normalizedName = normalize(nameForDeezerQuery);
            const matchedAlbum = deezerSearchRes.data.data?.find((a) => {
              const normalizedTitle = normalize(a.title);
              return (
                normalizedTitle === normalizedName ||
                normalizedTitle.includes(normalizedName) ||
                normalizedName.includes(normalizedTitle)
              );
            });

            if (!matchedAlbum) {
              const candidateCount = deezerSearchRes.data.data?.length || 0;
              console.log(
                `No Deezer match for "${name}" by ${artistName} - Deezer returned ${candidateCount} candidate(s)`
              );
              return;
            }
            if (finalAlbumsMap.has(matchedAlbum.id)) return; // already have this one

            const genre = await getAlbumGenre(matchedAlbum.id);
            if (DEEZER_GENRE_BLOCKLIST.includes((genre || "").toLowerCase())) return;

            let releaseType = "Album";
            try {
              const albumDetailRes = await fetchWithRetry(() =>
                callDeezer(`https://api.deezer.com/album/${matchedAlbum.id}`)
              );
              const nbTracks = albumDetailRes.data?.nb_tracks;
              // callDeezer silently returns an empty payload when rate-limited rather than throwing,
              // so only trust a real numeric track count instead of treating missing data as 0 (EP)
              if (typeof nbTracks === "number") {
                releaseType = getReleaseType(nbTracks);
              }
            } catch (err) {
              console.warn(`Failed to fetch track count for Deezer album ${matchedAlbum.id}:`, err.message);
            }

            finalAlbumsMap.set(matchedAlbum.id, {
              id: matchedAlbum.id,
              title: matchedAlbum.title,
              artist: matchedAlbum.artist?.name || artistName,
              cover: matchedAlbum.cover,
              releaseDate,
              type: "Album",
              isExplicit: matchedAlbum.explicit_lyrics || false,
              releaseType,
              popularity: maxPopularity,
              genre,
            });
          } catch (err) {
            console.warn(
              `Failed Deezer match for "${name}" by ${artistName}:`,
              err.message
            );
          }
        })
      );

      console.log(`Progress: ${finalAlbumsMap.size}/${TARGET_COUNT} albums matched (ranked position ${i + DEEZER_BATCH_SIZE}/${candidatePool.length})`);
    }

    // Phase 3b: supplement with Deezer's own official Albums chart if still short of target.
    // Already real Deezer data - no cross-platform title matching needed at all.
    if (finalAlbumsMap.size < TARGET_COUNT) {
      let chartIndex = 0;
      let chartAdded = 0;

      while (finalAlbumsMap.size < TARGET_COUNT && chartIndex < 200) {
        const chartRes = await fetchWithRetry(() =>
          callDeezer(`https://api.deezer.com/chart/0/albums?index=${chartIndex}&limit=50`)
        );
        const chartAlbums = chartRes.data.data || [];
        chartIndex += 50;

        if (chartAlbums.length === 0) break;

        for (const album of chartAlbums) {
          if (finalAlbumsMap.size >= TARGET_COUNT) break;
          if (finalAlbumsMap.has(album.id)) continue;

          const genre = await getAlbumGenre(album.id);
          if (DEEZER_GENRE_BLOCKLIST.includes((genre || "").toLowerCase())) continue;

          // Chart summary objects don't include release_date - fetch full album detail
          let releaseDate = "0000-00-00";
          let releaseType = "Album";
          try {
            const detailRes = await fetchWithRetry(() => callDeezer(`https://api.deezer.com/album/${album.id}`));
            releaseDate = detailRes.data?.release_date || releaseDate;
            const nbTracks = detailRes.data?.nb_tracks;
            if (typeof nbTracks === "number") {
              releaseType = getReleaseType(nbTracks);
            }
          } catch (err) {
            console.warn(`Failed to fetch release date for Deezer chart album ${album.id}:`, err.message);
          }

          // Synthetic popularity from chart position (rank 1 = ~99, rank 100 = ~0)
          const chartPopularity = Math.max(0, 100 - (album.position || 0));

          finalAlbumsMap.set(album.id, {
            id: album.id,
            title: album.title,
            artist: album.artist?.name || "Unknown",
            cover: album.cover,
            releaseDate,
            type: "Album",
            isExplicit: album.explicit_lyrics || false,
            releaseType,
            popularity: chartPopularity,
            genre,
          });
          chartAdded++;
        }
      }

      console.log(`Phase 3b (Deezer chart): added ${chartAdded} candidates, total now ${finalAlbumsMap.size}/${TARGET_COUNT}`);
    }


    let dedupedAlbums = Array.from(finalAlbumsMap.values());

    // Sort albums by popularity (tiebreak: release date, newest first)
    dedupedAlbums.sort((a, b) => {
      const popDiff = (b.popularity || 0) - (a.popularity || 0);
      if (popDiff !== 0) return popDiff;
      return new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime();
    });

    // Last-resort fallback: only if Spotify pagination ran dry before hitting the target
    if (dedupedAlbums.length < TARGET_COUNT) {
      const existingAlbums = await AlbumImage.find()
        .sort({ popularity: -1, releaseDate: -1 })
        .lean();

      const needed = TARGET_COUNT - dedupedAlbums.length;
      const fallback = existingAlbums
        .filter((existing) => !dedupedAlbums.find((a) => a.id === existing.id))
        // Require genre data to be present (reject undefined/legacy records outright,
        // not just blocklisted ones) so old un-vetted records can't persist forever
        .filter((existing) => existing.genre && !DEEZER_GENRE_BLOCKLIST.includes(existing.genre.toLowerCase()))
        .slice(0, needed);

      if (fallback.length > 0) {
        console.warn(`Spotify pagination exhausted, backfilling ${fallback.length} from previous run.`);
      }

      dedupedAlbums = dedupedAlbums.concat(fallback);
    }

    // Final cap
    dedupedAlbums = dedupedAlbums.slice(0, TARGET_COUNT);

    // Display order: most popular first (already sorted this way above)
    dedupedAlbums = dedupedAlbums.map((album, index) => ({ ...album, order: index }));

    console.log("Final order (order: popularity - releaseDate - title):");
    console.log(dedupedAlbums.map((a) => `${a.order}: ${a.popularity} - ${a.releaseDate} - ${a.title}`).join("\n"));

    // Clear out old records and store the final set
    await AlbumImage.deleteMany({});
    await AlbumImage.insertMany(dedupedAlbums);

    console.log(`✅ Album marquee job finished successfully - stored ${dedupedAlbums.length} albums`);

    return true;
  } catch (error) {
    console.error(
      "❌ Album marquee job failed:",
      error.response?.data || error.message
    );
    return false;
  }
};

// Retrieve stored album images from the database
const getAlbumImages = async (req, res) => {
  try {
    const albums = await AlbumImage.find({}).sort({ order: 1 }).lean();

    if (!albums.length) {
      return res.status(404).json({ message: "No stored albums found" });
    }

    res.json({ albums });
  } catch (error) {
    console.error("Error retrieving stored album images:", error.message);
    res.status(500).json({ message: "Failed to retrieve stored albums" });
  }
};

module.exports = {
  getUserPlaylists,
  importPlaylists,
  getAlbumImages,
  setAlbumImages,
};
