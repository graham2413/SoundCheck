const axios = require("axios");
const User = require("../models/User");
const AlbumImage = require("../models/AlbumImage");
const getSpotifyAccessToken = require("../auth/spotifyAuth");
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

// Fetch top albums from Spotify and store them in the database (runs once a week)
const setAlbumImages = async () => {
  try {
    const accessToken = await getSpotifyAccessToken();
    if (!accessToken) {
      console.error("Failed to get Spotify access token.");
      return false;
    }

    // Substring-matched against each artist's Spotify genre tags
    const SPOTIFY_GENRE_BLOCKLIST = [
      "bollywood", "desi", "latin", "reggaeton", "sertanejo",
      "k-pop", "mandopop", "afrobeats", "punjabi",
      // Brazilian funk
      "brazilian funk", "funk carioca", "brega funk", "phonk", "brazilian phonk",
      "brazilian trap", "funk consciente", "funk bruxaria", "funk de bh",
      // Mexican regional / corridos
      "corridos", "sierreño", "banda", "norteño", "música mexicana", "corrido",
      "cumbia norteña", "dembow belico",
      // Tamil/Telugu film industry (same category as bollywood)
      "kollywood", "tollywood", "tamil pop", "telugu pop", "tamil dance", "tamil hip hop",
      // Classical
      "baroque", "classical", "concerto", "early music", "choral", "renaissance",
      "gregorian chant", "opera", "chamber music", "orchestral",
    ];

    // Exact-matched against the Deezer album genre name
    const DEEZER_GENRE_BLOCKLIST = [
      "films/games", "brazilian music", "unknown", "asian music", "latin music", "traditional mexicano", "electro", "banda/grupero", "classical",
    ];

    const currentYear = new Date().getFullYear();
    const TARGET_COUNT = 110;
    const PAGE_LIMIT = 50;
    const MAX_OFFSET = 950; // Spotify search caps offset+limit at 1000

    const artistPopularityMap = new Map();
    const artistGenresMap = new Map();
    const candidatePool = []; // every album passing popularity+genre filters, across all pages

    let offset = 0;

    // Phase 1: scan every page (Spotify-only, no Deezer yet) to build the full candidate pool
    while (offset <= MAX_OFFSET) {
      const res = await axios.get("https://api.spotify.com/v1/search", {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          q: `year:${currentYear} tag:new`,
          type: "album",
          limit: PAGE_LIMIT,
          offset,
          market: "US",
        },
        httpsAgent,
      });

      const pageAlbums = res.data.albums?.items || [];
      offset += PAGE_LIMIT;

      if (pageAlbums.length === 0) {
        console.log("No more Spotify results, stopping pagination.");
        break;
      }

      // Fetch popularity + genres for any artists we haven't seen yet
      const newArtistIds = [
        ...new Set(pageAlbums.flatMap((a) => a.artists.map((ar) => ar.id))),
      ].filter((id) => !artistPopularityMap.has(id));

      for (let i = 0; i < newArtistIds.length; i += 50) {
        const batch = newArtistIds.slice(i, i + 50);
        const artistRes = await axios.get("https://api.spotify.com/v1/artists", {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { ids: batch.join(",") },
          httpsAgent,
        });

        artistRes.data.artists.forEach((artist) => {
          artistPopularityMap.set(artist.id, artist.popularity);
          artistGenresMap.set(artist.id, artist.genres || []);
        });
      }

      // Filter this page by artist popularity + exclude blocklisted genres (US-only marquee)
      const popularityFilteredAlbums = pageAlbums.filter((album) =>
        album.artists.some((artist) => (artistPopularityMap.get(artist.id) || 0) >= 75)
      );

      const filteredPageAlbums = popularityFilteredAlbums.filter((album) =>
        !album.artists.some((artist) =>
          (artistGenresMap.get(artist.id) || []).some((genre) =>
            SPOTIFY_GENRE_BLOCKLIST.some((blocked) => genre.toLowerCase().includes(blocked))
          )
        )
      );

      console.log(
        `Funnel (offset ${offset - PAGE_LIMIT}): raw=${pageAlbums.length} -> popularity>=75=${popularityFilteredAlbums.length} -> after genre blocklist=${filteredPageAlbums.length}`
      );

      candidatePool.push(...filteredPageAlbums);
    }

    // Phase 1b: supplement with Spotify's own editorially-curated New Releases feed
    // (a different endpoint than /search - skews toward notable releases, not just anything tagged "new")
    const seenSpotifyIds = new Set(candidatePool.map((a) => a.id));
    const newReleasesCutoff = new Date();
    newReleasesCutoff.setMonth(newReleasesCutoff.getMonth() - 3); // endpoint has no date param, so enforce it ourselves
    let newReleasesOffset = 0;
    let newReleasesAdded = 0;

    while (newReleasesOffset <= 950) {
      const res = await axios.get("https://api.spotify.com/v1/browse/new-releases", {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { country: "US", limit: PAGE_LIMIT, offset: newReleasesOffset },
        httpsAgent,
      });

      const pageAlbums = (res.data.albums?.items || []).filter((a) => !seenSpotifyIds.has(a.id));
      newReleasesOffset += PAGE_LIMIT;

      if (pageAlbums.length === 0) {
        if (!res.data.albums?.next) break;
        continue;
      }

      const newArtistIds = [
        ...new Set(pageAlbums.flatMap((a) => a.artists.map((ar) => ar.id))),
      ].filter((id) => !artistPopularityMap.has(id));

      for (let i = 0; i < newArtistIds.length; i += 50) {
        const batch = newArtistIds.slice(i, i + 50);
        const artistRes = await axios.get("https://api.spotify.com/v1/artists", {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { ids: batch.join(",") },
          httpsAgent,
        });

        artistRes.data.artists.forEach((artist) => {
          artistPopularityMap.set(artist.id, artist.popularity);
          artistGenresMap.set(artist.id, artist.genres || []);
        });
      }

      const dateFilteredAlbums = pageAlbums.filter((album) =>
        new Date(album.release_date || 0).getTime() >= newReleasesCutoff.getTime()
      );

      const popularityFilteredAlbums = dateFilteredAlbums.filter((album) =>
        album.artists.some((artist) => (artistPopularityMap.get(artist.id) || 0) >= 75)
      );

      const filteredPageAlbums = popularityFilteredAlbums.filter((album) =>
        !album.artists.some((artist) =>
          (artistGenresMap.get(artist.id) || []).some((genre) =>
            SPOTIFY_GENRE_BLOCKLIST.some((blocked) => genre.toLowerCase().includes(blocked))
          )
        )
      );

      filteredPageAlbums.forEach((album) => seenSpotifyIds.add(album.id));
      candidatePool.push(...filteredPageAlbums);
      newReleasesAdded += filteredPageAlbums.length;

      console.log(
        `Phase 1b funnel (offset ${newReleasesOffset - PAGE_LIMIT}): raw=${pageAlbums.length} -> within 3mo=${dateFilteredAlbums.length} -> popularity>=75=${popularityFilteredAlbums.length} -> after genre blocklist=${filteredPageAlbums.length}`
      );

      if (!res.data.albums?.next) break;
    }

    console.log(`Phase 1b (new-releases feed): added ${newReleasesAdded} new candidates, pool now ${candidatePool.length}`);

    // Phase 2: rank the full pool by popularity (tiebreak: release date, newest first)
    candidatePool.sort((a, b) => {
      const popA = Math.max(...a.artists.map((ar) => artistPopularityMap.get(ar.id) || 0));
      const popB = Math.max(...b.artists.map((ar) => artistPopularityMap.get(ar.id) || 0));
      if (popB !== popA) return popB - popA;
      return new Date(b.release_date || 0).getTime() - new Date(a.release_date || 0).getTime();
    });

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
          const maxPopularity = Math.max(
            ...album.artists.map((a) => artistPopularityMap.get(a.id) || 0)
          );

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
              const artistGenres = album.artists.flatMap((a) => artistGenresMap.get(a.id) || []);
              console.log(
                `No Deezer match for "${name}" by ${artistName} - Deezer returned ${candidateCount} candidate(s) - Spotify genres: [${artistGenres.join(", ")}]`
              );
              return;
            }
            if (finalAlbumsMap.has(matchedAlbum.id)) return; // already have this one

            const genre = await getAlbumGenre(matchedAlbum.id);
            if (DEEZER_GENRE_BLOCKLIST.includes((genre || "").toLowerCase())) return;

            finalAlbumsMap.set(matchedAlbum.id, {
              id: matchedAlbum.id,
              title: matchedAlbum.title,
              artist: matchedAlbum.artist?.name || artistName,
              cover: matchedAlbum.cover,
              releaseDate,
              type: "Album",
              isExplicit: matchedAlbum.explicit_lyrics || false,
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
          try {
            const detailRes = await fetchWithRetry(() => callDeezer(`https://api.deezer.com/album/${album.id}`));
            releaseDate = detailRes.data?.release_date || releaseDate;
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
            popularity: chartPopularity,
            genre,
          });
          chartAdded++;
        }
      }

      console.log(`Phase 3b (Deezer chart): added ${chartAdded} candidates, total now ${finalAlbumsMap.size}/${TARGET_COUNT}`);
    }


    let dedupedAlbums = Array.from(finalAlbumsMap.values());

    // Sort albums by release date (newest first), then popularity
    dedupedAlbums.sort((a, b) => {
      const dateDiff =
        new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime();
      if (dateDiff !== 0) return dateDiff;
      return (b.popularity || 0) - (a.popularity || 0);
    });

    // Last-resort fallback: only if Spotify pagination ran dry before hitting the target
    if (dedupedAlbums.length < TARGET_COUNT) {
      const existingAlbums = await AlbumImage.find()
        .sort({ releaseDate: -1, popularity: -1 })
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

    // Reorder by highest popularity across genres: each step, pick the highest-popularity
    // album from any genre bucket that ISN'T the genre just picked (avoids back-to-back repeats
    // while staying as close to descending popularity as possible)
    const genreBuckets = new Map();
    dedupedAlbums.forEach((album) => {
      const key = album.genre || "Unknown";
      if (!genreBuckets.has(key)) genreBuckets.set(key, []);
      genreBuckets.get(key).push(album);
    });

    // Sort each bucket by popularity descending so the front of each bucket is always its best pick
    genreBuckets.forEach((bucket) => bucket.sort((a, b) => (b.popularity || 0) - (a.popularity || 0)));

    const diversifiedAlbums = [];
    let lastGenre = null;

    while (diversifiedAlbums.length < dedupedAlbums.length) {
      let candidateKeys = Array.from(genreBuckets.keys()).filter(
        (key) => genreBuckets.get(key).length > 0 && key !== lastGenre
      );

      // Only allow repeating the same genre if it's the sole bucket left with items
      if (candidateKeys.length === 0) {
        candidateKeys = Array.from(genreBuckets.keys()).filter((key) => genreBuckets.get(key).length > 0);
      }

      let bestKey = null;
      let bestPopularity = -1;
      for (const key of candidateKeys) {
        const topAlbum = genreBuckets.get(key)[0];
        if ((topAlbum.popularity || 0) > bestPopularity) {
          bestPopularity = topAlbum.popularity || 0;
          bestKey = key;
        }
      }

      diversifiedAlbums.push(genreBuckets.get(bestKey).shift());
      lastGenre = bestKey;
    }

    dedupedAlbums = diversifiedAlbums.map((album, index) => ({ ...album, order: index }));

    console.log("Final diversified order (order: [genre] popularity - title):");
    console.log(dedupedAlbums.map((a) => `${a.order}: [${a.genre}] pop=${a.popularity} - ${a.title}`).join("\n"));

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
