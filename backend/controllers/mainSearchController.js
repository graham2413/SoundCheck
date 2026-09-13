const redis = require("../utils/redisClient");
const { callDeezer } = require("../utils/callDeezer");
const { fetchWithRetry } = require("../utils/fetchWithRetry");
const { findArtistId, getUpcomingAlbums } = require("../utils/callSpotify");
const {
  CALENDAR_CACHE_TIMEZONE,
  getLocalDateString,
  buildCalendarSubtitle,
  buildCalendarMonthGroups,
} = require("../utils/calendarHelpers");
const Release = require("../models/Release");
const User = require("../models/User");
const { notifyUsersForNewMusicRelease } = require("../utils/pushNotifications");

const MUSIC_CALENDAR_CACHE_TTL = 86400; // 24h safety-net - actual invalidation is calendar-day based

const searchMusic = async (req, res) => {
  try {
    const { query, type = "songs" } = req.query;
    if (!query) return res.status(400).json({ message: "Query is required" });

    const typeKey = type.toLowerCase();
    const queryKey = query.trim().toLowerCase();
    const cacheKey = `search:${typeKey}:${queryKey}`;

    // Check Redis cache
    const cached = await redis.safeGet(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    // Prepare response parts
    let songs = [],
      albums = [],
      artists = [];

    // === TYPE: ALL ===
    if (typeKey === "all") {
      const [songsResult, albumsResult, artistsResult] =
        await Promise.allSettled([
          fetchWithRetry(() =>
            callDeezer(
              `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=15`
            )
          ),
          fetchWithRetry(() =>
            callDeezer(
              `https://api.deezer.com/search/album?q=${encodeURIComponent(query)}&limit=10`
            )
          ),
          fetchWithRetry(() =>
            callDeezer(
              `https://api.deezer.com/search/artist?q=${encodeURIComponent(query)}&limit=10`
            )
          ),
        ]);

      // SONGS
      if (songsResult.status === "fulfilled") {
        const songsRaw = songsResult.value.data?.data || [];
        const uniqueAlbumIds = [
          ...new Set(songsRaw.map((item) => item?.album?.id).filter(Boolean)),
        ];
        const albumGenresMap = await getAlbumGenresBatch(uniqueAlbumIds);

        songs = songsRaw.map((item) => ({
          id: item?.id,
          title: item?.title,
          artist: item?.artist?.name,
          album: item?.album?.title,
          cover: item?.album?.cover,
          preview: item?.preview,
          isExplicit: item?.explicit_lyrics,
          genre: albumGenresMap.get(item?.album?.id) || "Unknown",
        }));
      }

      // ALBUMS
      if (albumsResult.status === "fulfilled") {
        const albumsRaw = albumsResult.value.data?.data || [];
        const albumGenresMap = await getAlbumGenresBatch(
          albumsRaw.map((album) => album?.id).filter(Boolean)
        );

        albums = albumsRaw.map((album) => ({
          id: album?.id,
          title: album?.title,
          artist: album?.artist?.name || "Unknown",
          cover: album?.cover,
          genre: albumGenresMap.get(album?.id) || "Unknown",
          isExplicit: album?.explicit_lyrics,
        }));
      }

      // ARTISTS
      if (artistsResult.status === "fulfilled") {
        const artistsRaw = artistsResult.value.data?.data || [];
        artists = artistsRaw.map((artist) => ({
          id: artist?.id,
          name: artist?.name,
          picture: artist?.picture,
          tracklist: artist?.tracklist,
        }));
      }
    } else {
      // === TYPE: SONGS ===
      if (typeKey === "songs") {
        const songsRes = await fetchWithRetry(() =>
          callDeezer(
            `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=15`
          )
        );
        const songsRaw = songsRes.data?.data || [];
        const uniqueAlbumIds = [
          ...new Set(songsRaw.map((item) => item?.album?.id).filter(Boolean)),
        ];
        const albumGenresMap = await getAlbumGenresBatch(uniqueAlbumIds);

        songs = songsRaw.map((item) => ({
          id: item?.id,
          title: item?.title,
          artist: item?.artist?.name,
          album: item?.album?.title,
          cover: item?.album?.cover,
          preview: item?.preview,
          isExplicit: item?.explicit_lyrics,
          genre: albumGenresMap.get(item?.album?.id) || "Unknown",
        }));
      }

      // === TYPE: ALBUMS ===
      if (typeKey === "albums") {
        const albumsRes = await fetchWithRetry(() =>
          callDeezer(
            `https://api.deezer.com/search/album?q=${encodeURIComponent(query)}&limit=10`
          )
        );
        const albumsRaw = albumsRes.data?.data || [];
        const albumGenresMap = await getAlbumGenresBatch(
          albumsRaw.map((album) => album?.id).filter(Boolean)
        );

        albums = albumsRaw.map((album) => ({
          id: album?.id,
          title: album?.title,
          artist: album?.artist?.name || "Unknown",
          cover: album?.cover,
          genre: albumGenresMap.get(album?.id) || "Unknown",
          isExplicit: album?.explicit_lyrics,
        }));
      }

      // === TYPE: ARTISTS ===
      if (typeKey === "artists") {
        const artistsRes = await fetchWithRetry(() =>
          callDeezer(
            `https://api.deezer.com/search/artist?q=${encodeURIComponent(query)}&limit=10`
          )
        );
        const artistsRaw = artistsRes.data?.data || [];

        artists = artistsRaw.map((artist) => ({
          id: artist?.id,
          name: artist?.name,
          picture: artist?.picture,
          tracklist: artist?.tracklist,
        }));
      }
    }

    const responsePayload =
      typeKey === "songs"
        ? { songs }
        : typeKey === "albums"
          ? { albums }
          : typeKey === "artists"
            ? { artists }
            : { songs, albums, artists };

    await redis.safeSet(cacheKey, JSON.stringify(responsePayload), "EX", 3600);
    res.json(responsePayload);
  } catch (error) {
    console.error("Error in searchMusic:", error.message);
    res.status(500).json({ message: "Search failed" });
  }
};

// Fetches genre fresh from Deezer (no cache read) - shared by the
// single-album and batched lookup paths so there's one place that
// knows how to derive a genre from Deezer's album payload.
async function fetchAlbumGenreFresh(albumId) {
  const albumCacheKey = `album-genre:${albumId}`;
  try {
    const albumDetails = await fetchWithRetry(() =>
      callDeezer(`https://api.deezer.com/album/${albumId}`)
    );

    if (!albumDetails.data) {
      console.error(`Missing data in album details for album ${albumId}`);
      return "Unknown";
    }

    let genre = null;

    // Prefer genre_id (now backed by its own cache)
    const genreId = albumDetails.data.genre_id;
    if (genreId && genreId > 0) {
      genre = await getGenreFromId(genreId);
    }

    // Fallback: use .genres.data if no valid genre_id or failed lookup
    if (!genre) {
      const genresArray = albumDetails.data.genres?.data;
      genre = genresArray?.length ? genresArray[0].name : null;
    }

    if (!genre) {
      genre = "Unknown";
    }

    // Cache the result per album for 1 day
    await redis.safeSet(albumCacheKey, genre, "EX", 86400);

    return genre;
  } catch (err) {
    console.error(`Failed to fetch genre for album ${albumId}:`, err.message);
    return "Unknown";
  }
}

async function getAlbumGenre(albumId) {
  if (!albumId || typeof albumId !== "number" || isNaN(albumId)) {
    return "Unknown";
  }

  const albumCacheKey = `album-genre:${albumId}`;
  const cachedGenre = await redis.safeGet(albumCacheKey);
  if (cachedGenre) return cachedGenre;

  return fetchAlbumGenreFresh(albumId);
}

// Batched lookup for a set of album IDs - one MGET covers every cache
// read instead of one GET per album, which is what search-as-you-type
// was generating on every distinct query (each with its own set of
// album IDs to resolve). Only genuine cache misses fall back to
// per-album Deezer fetches.
async function getAlbumGenresBatch(albumIds) {
  const validIds = [...new Set(albumIds)].filter(
    (id) => id && typeof id === "number" && !isNaN(id)
  );
  if (!validIds.length) return new Map();

  const keys = validIds.map((id) => `album-genre:${id}`);
  const cachedValues = await redis.safeMget(keys);

  const genreMap = new Map();
  const missingIds = [];
  validIds.forEach((id, index) => {
    const cached = cachedValues[index];
    if (cached) {
      genreMap.set(id, cached);
    } else {
      missingIds.push(id);
    }
  });

  if (missingIds.length) {
    const fetched = await Promise.all(
      missingIds.map(async (id) => [id, await fetchAlbumGenreFresh(id)])
    );
    fetched.forEach(([id, genre]) => genreMap.set(id, genre));
  }

  return genreMap;
}

async function getGenreFromId(genreId) {
  if (!genreId || genreId <= 0) return "Unknown";

  const cacheKey = `genre-id:${genreId}`;
  const cached = await redis.safeGet(cacheKey);
  if (cached) return cached;

  try {
    const genreResponse = await fetchWithRetry(() =>
      callDeezer(`https://api.deezer.com/genre/${genreId}`)
    );
    const name = genreResponse.data?.name || null;

    await redis.safeSet(cacheKey, name || "Unknown", "EX", 86400); // cache even if "Unknown"
    return name || "Unknown";
  } catch (error) {
    console.error(
      `Failed to fetch genre name for ID ${genreId}:`,
      error.message
    );
    // Cache failure to avoid repeated retries
    await redis.safeSet(cacheKey, "Unknown", "EX", 86400);
    return "Unknown";
  }
}

const getTrackDetails = async (req, res) => {
  try {
    const { trackId } = req.params;

    if (!trackId) {
      return res.status(400).json({ message: "Track ID is required" });
    }

    // Fetch track details using rate-limited function
    const trackResponse = await fetchWithRetry(() =>
      callDeezer(`https://api.deezer.com/track/${trackId}`)
    );

    if (!trackResponse.data) {
      return res.status(404).json({ message: "Track not found" });
    }

    // Extract relevant details
    const trackData = trackResponse.data;

    // Check if album ID is available to fetch genre
    let genre = "Unknown";
    if (trackData.album?.id && typeof trackData.album.id === "number") {
      genre = await getAlbumGenre(trackData.album.id);
    }

    const trackDetails = {
      id: trackData.id,
      preview: trackData.preview,
      releaseDate: trackData.release_date || "Unknown",
      duration: trackData.duration, // in seconds
      albumTitle: trackData.album?.title || "Unknown",
      contributors: trackData.contributors
        ? trackData.contributors.map((c) => c.name)
        : [],
      genre: genre,
    };

    return res.json(trackDetails);
  } catch (error) {
    console.error(
      `Error fetching track details for ID ${req.params.trackId}:`,
      error.message
    );
    return res
      .status(500)
      .json({ message: "Failed to retrieve track details" });
  }
};

// Strips parenthetical/bracketed suffixes ("(feat. X)", "[Remastered 2011]")
// and normalizes case/whitespace so cache keys and match comparisons aren't
// thrown off by cosmetic differences between a provider's title string and
// Deezer's.
function normalizeForMatch(value) {
  return (value || "")
    .toLowerCase()
    .replace(/[\(\[][^)\]]*[\)\]]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Resolves a bare title+artist string (e.g. from a soundtrack provider that
// has no Deezer ID of its own) to a real Deezer track - the one place new
// Deezer *search* traffic gets introduced for the soundtrack feature, and
// only ever called once per song per cache window, on click (see
// cinema-soundtrack-list's click handler), never for an entire list at once.
const RESOLVE_CACHE_TTL = 14 * 24 * 60 * 60; // 2 weeks - matches the soundtrack list's own cache TTL

async function resolveTrack(req, res) {
  try {
    const { title, artist } = req.query;
    if (!title) {
      return res.status(400).json({ message: "title is required" });
    }

    // v3: cover URLs weren't upgraded to Deezer's `?size=xl` (were serving
    // a small default thumbnail) - bumped so already-cached low-res results
    // don't shadow the fixed ones for the rest of their TTL.
    const cacheKey = `deezer:resolve:v3:${normalizeForMatch(title)}::${normalizeForMatch(artist)}`;
    const cached = await redis.safeGet(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      return res.status(parsed ? 200 : 404).json(parsed || { message: "Track not found on Deezer" });
    }

    // Deezer's advanced track:"..."/artist:"..." search operators were tried
    // here first and directly verified (against Deezer's real API, not a
    // caching/rate-limit artifact) to return zero results even for an exact,
    // correctly-spelled title+artist pair - so this is a plain free-text
    // query, same as the rest of the app's existing search already uses.
    const plainQuery = artist ? `${title} ${artist}` : title;
    const searchRes = await fetchWithRetry(() =>
      callDeezer(`https://api.deezer.com/search?q=${encodeURIComponent(plainQuery)}&limit=5`)
    );
    const results = searchRes.data?.data || [];

    // Prefer a result whose artist also matches (a plain query can rank a
    // same-named song by someone else first); otherwise take Deezer's
    // top-ranked result.
    const normalizedArtist = normalizeForMatch(artist);
    const best =
      (normalizedArtist && results.find((r) => normalizeForMatch(r?.artist?.name) === normalizedArtist)) ||
      results[0] ||
      null;

    if (!best) {
      await redis.safeSet(cacheKey, JSON.stringify(null), "EX", RESOLVE_CACHE_TTL);
      return res.status(404).json({ message: "Track not found on Deezer" });
    }

    const genre = best.album?.id ? await getAlbumGenre(best.album.id) : "Unknown";
    // Deezer's plain `cover` field is a small default-size thumbnail - every
    // other consumer of a Deezer cover in this app upgrades it with
    // `?size=xl` (see e.g. getHighQualityImage/highQualityCover across the
    // frontend); done here instead so every caller of this endpoint gets a
    // real high-res image without having to remember to do it themselves.
    const rawCover = best.album?.cover;
    const cover = rawCover && rawCover.includes("api.deezer.com") ? `${rawCover}?size=xl` : rawCover;
    const song = {
      id: best.id,
      title: best.title,
      artist: best.artist?.name,
      album: best.album?.title,
      cover,
      preview: best.preview,
      isExplicit: best.explicit_lyrics,
      genre,
      type: "Song",
    };

    await redis.safeSet(cacheKey, JSON.stringify(song), "EX", RESOLVE_CACHE_TTL);
    return res.status(200).json(song);
  } catch (error) {
    console.error("Error in resolveTrack:", error.message);
    return res.status(500).json({ message: "Failed to resolve track" });
  }
}

const getAlbumDetails = async (req, res) => {
  try {
    const { albumId } = req.params;

    if (!albumId) {
      return res.status(400).json({ message: "Album ID is required" });
    }

    // Fetch album details using rate-limited function
    const albumResponse = await fetchWithRetry(() =>
      callDeezer(`https://api.deezer.com/album/${albumId}`)
    );

    if (!albumResponse.data) {
      return res.status(404).json({ message: "Album not found" });
    }

    // Extract relevant details
    const albumData = albumResponse.data;
    const firstTrack = albumData.tracks?.data?.[0];

    let genre = albumData.genres?.data?.[0]?.name || null;

    if (!genre && albumData.genre_id) {
      genre = await getGenreFromId(albumData.genre_id);
    }

    if (!genre) genre = "Unknown";

    const albumDetails = {
      id: albumData.id,
      releaseDate: albumData.release_date || "Unknown",
      tracklist:
        albumData.tracks?.data?.map((track) => ({
          id: track.id,
          title: track.title,
          artist: track.artist?.name || "Unknown",
          album: track.album?.title || "Unknown",
          duration: track.duration,
          preview: track.preview,
          isExplicit: track.explicit_lyrics,
          cover: track.album?.cover,
          type: "Song",
          genre: genre,
        })) || [],
      genre: genre,
      artist: albumData.artist?.name || "Unknown",
      contributors: albumData.contributors?.map((c) => c.name) || [],
      isExplicit: albumData.explicit_lyrics,
      preview: firstTrack?.preview || null,
    };

    return res.json(albumDetails);
  } catch (error) {
    console.error(
      `Error fetching album details for ID ${req.params.albumId}:`,
      error.message
    );
    return res
      .status(500)
      .json({ message: "Failed to retrieve album details" });
  }
};

const getArtistTopTracks = async (req, res) => {
  try {
    const { artistId } = req.params;

    if (!artistId) {
      return res.status(400).json({ message: "Artist ID is required" });
    }

    // Fetch artist track details using rate-limited function
    const artistsResponse = await fetchWithRetry(() =>
      callDeezer(`https://api.deezer.com/artist/${artistId}/top?limit=25`)
    );

    // Ensure the API response has expected structure
    if (
      !artistsResponse ||
      !artistsResponse.data ||
      !Array.isArray(artistsResponse.data.data)
    ) {
      return res
        .status(404)
        .json({ message: "Artist not found or no tracks available" });
    }

    const artistTopTrackDetails = artistsResponse.data.data.map((track) => {
      return {
        id: track.id,
        title: track.title,
        artist: track.artist?.name || "Unknown",
        album: track.album?.title || "Unknown",
        duration: track.duration,
        preview: track.preview,
        isExplicit: track.explicit_lyrics,
        cover: track.album?.cover,
        type: "Song",
      };
    });

    return res.json(artistTopTrackDetails);
  } catch (error) {
    console.error(
      `Error fetching artist track details for ID ${req.params.artistId}:`,
      error.message
    );
    return res
      .status(500)
      .json({ message: "Failed to retrieve artist track details" });
  }
};

// Shared method to sync artist albums to MongoDB
// This is used both for manual sync and scheduled tasks
async function syncArtistAlbums(artistId, artistName, fullSync = false) {
  try {
    let allAlbums = [];

    if (fullSync) {
      let index = 0;
      const limit = 100;

      while (true) {
        const url = `https://api.deezer.com/artist/${artistId}/albums?limit=${limit}&index=${index}`;
        const response = await fetchWithRetry(() => callDeezer(url));
        if (!response?.data?.data?.length) break;

        allAlbums.push(...response.data.data);
        index += limit;

        if (!response.data.next) break;
      }
    } else {
      const limit = 100;
      for (let index = 0; index < 200; index += 100) {
        const url = `https://api.deezer.com/artist/${artistId}/albums?limit=${limit}&index=${index}`;
        const response = await fetchWithRetry(() => callDeezer(url));
        if (!response?.data?.data?.length) break;
        allAlbums.push(...response.data.data);
      }
    }

    const allAlbumIds = allAlbums.map((album) => album.id.toString());

    const existingIds = await Release.find({
      albumId: { $in: allAlbumIds },
      artistId,
    }).distinct("albumId");

    const seen = new Set();

    const newAlbums = allAlbums.filter((album) => {
      const dateKey = album.release_date.slice(0, 7); // e.g., "2025-01"
      const titleKey = album.title.toLowerCase().trim();
      const key = `${titleKey}|${dateKey}`;

      if (seen.has(key)) return false;
      seen.add(key);
      return !existingIds.includes(album.id.toString());
    });

    // --- Update recently released (including future) albums if data changed ---
    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(now.getDate() - 30);

    const recentlyChangedAlbums = allAlbums.filter((album) => {
      const releaseDate = new Date(album.release_date);
      return releaseDate >= thirtyDaysAgo;
    });

    const recentlyChangedAlbumIds = recentlyChangedAlbums.map((a) =>
      a.id.toString()
    );

    const existingRecentReleases = await Release.find({
      albumId: { $in: recentlyChangedAlbumIds },
      artistId,
      releaseDate: { $gte: thirtyDaysAgo },
    });

    const DEFAULT_COVER =
      "https://res.cloudinary.com/drbccjuul/image/upload/e_improve:outdoor/m2bmgchypxctuwaac801";
    const DEFAULT_TITLE = "Untitled Album";
    const DEFAULT_RELEASE_DATE = new Date("1970-01-01");

    const updates = [];

    for (const album of recentlyChangedAlbums) {
      const existing = existingRecentReleases.find(
        (r) => r.albumId === album.id.toString()
      );
      if (!existing) continue;

      const updatedFields = {};

      const title = album.title?.trim() || DEFAULT_TITLE;
      const cover = album.cover?.trim() || DEFAULT_COVER;
      const releaseDate = album.release_date
        ? new Date(album.release_date)
        : DEFAULT_RELEASE_DATE;

      if (title !== existing.title) updatedFields.title = title;
      if (cover !== existing.cover) updatedFields.cover = cover;
      if (releaseDate.getTime() !== new Date(existing.releaseDate).getTime()) {
        updatedFields.releaseDate = releaseDate;
      }
      if (album.record_type && album.record_type !== existing.recordType) {
        updatedFields.recordType = album.record_type;
      }

      if (Object.keys(updatedFields).length > 0) {
        updates.push({
          updateOne: {
            filter: { _id: existing._id },
            update: { $set: updatedFields },
          },
        });
      }
    }

    if (updates.length > 0) {
      await Release.bulkWrite(updates);
      console.log(
        `Updated ${updates.length} recent/future albums for ${artistName} (${artistId})`
      );
    }

    if (newAlbums.length === 0) {
      console.log(`No new albums for ${artistName} (${artistId})`);
      return;
    }

    const docsToInsert = newAlbums.map((album) => ({
      albumId: album.id,
      artistId,
      artistName,
      title: album.title?.trim() || DEFAULT_TITLE,
      cover: album.cover?.trim() || DEFAULT_COVER,
      isExplicit: !!album.explicit_lyrics,
      releaseDate: album.release_date
        ? new Date(album.release_date)
        : DEFAULT_RELEASE_DATE,
      recordType: album.record_type || null,
    }));

    await Release.insertMany(docsToInsert);
    console.log(
      `Inserted ${newAlbums.length} albums for ${artistName} (${artistId})`
    );

    await Promise.allSettled(
      docsToInsert.map((release) => notifyUsersForNewMusicRelease(release))
    );
  } catch (err) {
    console.error(
      `syncArtistAlbums failed for artist ${artistId} (${artistName}):`,
      err.message || err
    );
    throw err;
  }
}

// When a user manually triggers album sync for an artist (following an artist)
const getAndStoreArtistAlbums = async (req, res) => {
  if (!req.user || !req.user._id) {
    return res.status(401).json({ message: "Unauthorized. User not found." });
  }
  const artistId = req.params.id;
  const artistName = req.query.name;

  const redisKey = `artist-sync:user:${artistId}`;
  const cached = await redis.safeGet(redisKey);
  if (cached) return res.status(200).json({ message: "Recently synced" });

  await syncArtistAlbums(artistId, artistName, true);
  await redis.safeSet(redisKey, "1", "EX", 60 * 60 * 6); // 6h TTL

  res.status(200).json({ message: "Synced from user action" });
};

// Cron job method to update all followed artists' albums
async function cronSyncAllArtists(batchSize = 10, delayMs = 1000) {
  const followedArtists = await getFollowedArtistList();
  let totalSynced = 0;

  for (let i = 0; i < followedArtists.length; i += batchSize) {
    const batch = followedArtists.slice(i, i + batchSize);

    const syncBatch = batch.map(({ id, name }) => {
      return (async () => {
        const today = new Date().toISOString().slice(0, 10); // e.g., "2025-06-27"
        const redisKey = `artist-sync:cron:${id}:${today}`;
        const cached = await redis.safeGet(redisKey);
        if (cached) return { id, name, status: "skipped" };

        try {
          await syncArtistAlbums(id, name);
          await redis.safeSet(redisKey, "1", "EX", 60 * 60 * 24 * 2); // outlives the date-scoped key by a day as a safety margin
          return { id, name, status: "synced" };
        } catch (err) {
          console.error(
            `Cron sync failed for ${name} (${id}):`,
            err.message || err
          );
          return { id, name, status: "failed", error: err.message || err };
        }
      })();
    });

    const results = await Promise.allSettled(syncBatch);

    for (const result of results) {
      if (result.status === "fulfilled") {
        const { status } = result.value;
        if (status === "synced") totalSynced += 1;
      } else {
        console.error(`Unhandled sync rejection:`, result.reason);
      }
    }

    // Log per batch
    console.log(
      `Processed batch ${i / batchSize + 1} of ${Math.ceil(followedArtists.length / batchSize)}`
    );

    // Delay between batches
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  console.log(
    `Cron sync completed. Total artists: ${followedArtists.length}, Synced: ${totalSynced}`
  );
}

// Helper function to get the list of followed artists from MongoDB
async function getFollowedArtistList() {
  const users = await User.find({}, "artistList").lean();

  const allFollows = users.flatMap((u) => u.artistList || []);

  // Deduplicate by artistId
  const uniqueMap = new Map();
  for (const { id, name } of allFollows) {
    if (!uniqueMap.has(id)) {
      uniqueMap.set(id, name);
    }
  }

  return Array.from(uniqueMap, ([id, name]) => ({ id, name }));
}

// Fetch MongoDB releases by artist IDs for Artist feed
const getReleasesByArtistIds = async (req, res) => {
  try {
    const { artistIds } = req.body;
    const { cursorDate, cursorId, limit = 20 } = req.query;

    if (!Array.isArray(artistIds) || artistIds.length === 0) {
      return res
        .status(400)
        .json({ message: "artistIds must be a non-empty array" });
    }

    const query = {
      artistId: { $in: artistIds },
    };

    // If a cursor is provided, apply compound pagination logic
    if (cursorDate && cursorId) {
      query.$or = [
        { releaseDate: { $lt: new Date(cursorDate) } },
        {
          releaseDate: new Date(cursorDate),
          _id: { $lt: cursorId },
        },
      ];
    }

    const releases = await Release.find(query)
      .sort({ releaseDate: -1, _id: -1 })
      .limit(Number(limit))
      .lean();

    // Prepare next cursor if there are more results
    const last = releases[releases.length - 1];
    const nextCursor = last
      ? { cursorDate: last.releaseDate.toISOString(), cursorId: last._id }
      : null;

    return res.status(200).json({
      releases,
      nextCursor,
    });
  } catch (err) {
    console.error("Error fetching releases:", err.message || err);
    return res.status(500).json({ message: "Server error" });
  }
};

// GET /api/search/music-calendar (Protected) - the music equivalent of
// cinemaController.js's getCalendar, same response shape (data/hasMore/
// total/subtitle/monthGroups), reusing the exact same subtitle-cascade/
// month-group logic via utils/calendarHelpers.js.
//
// Past releases come from the locally-synced Release collection (Deezer's
// catalog - accurate for what's already out). Upcoming releases come from
// Spotify instead: Deezer's own catalog rarely carries a real pre-release
// date (labels typically don't list an album there until at/near street
// date), while Spotify commonly has pre-save pages live with a real future
// release_date weeks/months out - see utils/callSpotify.js's
// findArtistId/getUpcomingAlbums for the artist-name-based bridge and its
// accepted fuzzy-match tradeoff.
const getMusicCalendar = async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const range = req.query.range === "past" ? "past" : "upcoming";
    const cacheKey = `musicCalendar:${req.user._id}:${range}`;
    const todayStr = getLocalDateString(CALENDAR_CACHE_TIMEZONE);

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const buildPage = (calendar) => ({
      data: calendar.slice(offset, offset + limit),
      hasMore: offset + limit < calendar.length,
      total: calendar.length,
      subtitle: buildCalendarSubtitle(calendar, range, todayStr),
      monthGroups: buildCalendarMonthGroups(calendar),
    });

    if (!forceRefresh) {
      const cached = await redis.safeGet(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.cachedDate === todayStr) {
          return res.status(200).json({ success: true, ...buildPage(parsed.data) });
        }
      }
    }

    // req.user.artistList (this user's own follows) - NOT getFollowedArtistList,
    // which is the cron job's global cross-user list and would leak every
    // user's followed artists into this one's calendar.
    const followedArtists = req.user.artistList || [];
    const artistIds = followedArtists.map((a) => a.id);
    const artistNameById = new Map(followedArtists.map((a) => [a.id, a.name]));

    let calendar;

    if (range === "past") {
      const releases = await Release.find({
        artistId: { $in: artistIds },
        releaseDate: { $lt: new Date(todayStr) },
      })
        .sort({ releaseDate: -1 })
        .lean();

      calendar = releases.map((r) => ({
        _id: r._id.toString(),
        albumId: r.albumId,
        artistId: r.artistId,
        artistName: r.artistName,
        title: r.title,
        cover: r.cover,
        airDate: r.releaseDate.toISOString().slice(0, 10),
        isExplicit: r.isExplicit,
        // null for rows synced before this field existed - the frontend
        // falls back to a generic "Release" label rather than guessing.
        recordType: r.recordType || null,
      }));
    } else {
      // One Spotify artist-id resolution + one albums fetch per followed
      // artist (both independently Redis-cached in callSpotify.js, so only
      // the FIRST load within each cache window actually calls Spotify).
      // Chunked (not one big Promise.all) so a user following hundreds of
      // artists can't burst hundreds of concurrent Spotify requests at once
      // on a cold cache - bounded concurrency instead, same spirit as
      // cronSyncAllArtists' batchSize.
      const UPCOMING_FETCH_BATCH_SIZE = 10;
      const UPCOMING_FETCH_BATCH_DELAY_MS = 250;

      const perArtist = [];
      for (let i = 0; i < followedArtists.length; i += UPCOMING_FETCH_BATCH_SIZE) {
        const batch = followedArtists.slice(i, i + UPCOMING_FETCH_BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (artist) => {
            const spotifyId = await findArtistId(artist.name).catch(() => null);
            if (!spotifyId) return [];
            const albums = await getUpcomingAlbums(spotifyId).catch(() => []);
            return albums.map((a) => ({
              _id: `spotify-${a.albumId}`,
              albumId: a.albumId,
              artistId: artist.id,
              artistName: artistNameById.get(artist.id) || artist.name,
              title: a.title,
              cover: a.cover,
              airDate: a.releaseDate,
              isExplicit: false,
              recordType: a.recordType || null,
            }));
          })
        );
        perArtist.push(...batchResults);

        if (i + UPCOMING_FETCH_BATCH_SIZE < followedArtists.length) {
          await new Promise((resolve) => setTimeout(resolve, UPCOMING_FETCH_BATCH_DELAY_MS));
        }
      }

      calendar = perArtist.flat().sort((a, b) => a.airDate.localeCompare(b.airDate));
    }

    await redis.safeSet(cacheKey, JSON.stringify({ cachedDate: todayStr, data: calendar }), "EX", MUSIC_CALENDAR_CACHE_TTL);
    res.status(200).json({ success: true, ...buildPage(calendar) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

// Fetch all Deezer artist releases (fully sorted, all pages)
const getDeezerArtistReleases = async (req, res) => {
  const { artistId } = req.params;
  const artistName = req.query.artistName || "";

  if (!artistId) {
    return res.status(400).json({ message: "artistId is required" });
  }

  try {
    let allAlbums = [];
    let nextUrl = `https://api.deezer.com/artist/${artistId}/albums?limit=100&index=0`;

    // Keep fetching until there are no more pages
    while (nextUrl) {
      const response = await fetchWithRetry(() => callDeezer(nextUrl));
      const data = response?.data?.data;

      if (!data || data.length === 0) break;

      allAlbums = allAlbums.concat(data);
      nextUrl = response?.data?.next || null;
    }

    // Normalize and filter bad/missing dates
    const albums = allAlbums
      .map((album) => ({
        id: album.id,
        title: album.title,
        artist: artistName,
        cover: album.cover,
        releaseDate: album.release_date,
        isExplicit: album.explicit_lyrics || false,
      }))
      .filter((a) => a.releaseDate && !isNaN(new Date(a.releaseDate)))
      .sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate)); // Descending

    return res.status(200).json({
      albums,
      next: null, // no pagination — you already have all of them
    });
  } catch (err) {
    console.error(
      `Error fetching Deezer releases for artist ${artistId}:`,
      err.message || err
    );
    return res.status(500).json({ message: "Failed to fetch artist releases" });
  }
};

// smartLinkController.js
const https = require("https");
const axios = require("axios");
const fs = require("fs");

const isProd = process.env.NODE_ENV === "production";

// Use relaxed SSL agent in dev (if needed)
const agent = isProd
  ? new https.Agent()
  : new https.Agent({
      rejectUnauthorized: false, // allow self-signed certs
      ca: fs.existsSync("cacert.pem") ? fs.readFileSync("cacert.pem") : undefined,
    });

const getSmartLink = async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing required "url" query parameter.' });
  }

  try {
    const response = await axios.get(
      `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(url)}`,
      { httpsAgent: agent }
    );

    res.json(response.data);
  } catch (error) {
    console.error(
      "Smart link fetch failed:",
      error.response?.status ?? error.code ?? error.message,
      error.response?.data ?? ""
    );
    res.status(500).json({ error: "Failed to fetch smart link" });
  }
};

module.exports = {
  searchMusic,
  getAlbumGenre,
  getGenreFromId,
  getTrackDetails,
  resolveTrack,
  getAlbumDetails,
  getArtistTopTracks,
  callDeezer,
  getAndStoreArtistAlbums,
  cronSyncAllArtists,
  getReleasesByArtistIds,
  getMusicCalendar,
  getDeezerArtistReleases,
  getSmartLink
};