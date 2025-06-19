const redis = require('../utils/redisClient');
const { callDeezer } = require('../utils/callDeezer');
const Release = require('../models/Release');
const User = require('../models/User');

const searchMusic = async (req, res) => {
  try {
    const { query, type = 'songs' } = req.query;
    if (!query) return res.status(400).json({ message: "Query is required" });

    const typeKey = type.toLowerCase();
    const queryKey = query.trim().toLowerCase();
    const cacheKey = `search:${typeKey}:${queryKey}`;

    // Check Redis cache
    const cached = await redis.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    // Prepare response parts
    let songs = [], albums = [], artists = [];

    // === TYPE: ALL ===
    if (typeKey === 'all') {
      const [songsResult, albumsResult, artistsResult] = await Promise.allSettled([
        callDeezer(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=15`),
        callDeezer(`https://api.deezer.com/search/album?q=${encodeURIComponent(query)}&limit=10`),
        callDeezer(`https://api.deezer.com/search/artist?q=${encodeURIComponent(query)}&limit=10`)
      ]);

      // SONGS
      if (songsResult.status === 'fulfilled') {
        const songsRaw = songsResult.value.data?.data || [];
        const uniqueAlbumIds = [...new Set(songsRaw.map(item => item?.album?.id).filter(Boolean))];
        const albumGenresMap = new Map(
          await Promise.all(
            uniqueAlbumIds.map(async id => [id, await getAlbumGenre(id)])
          )
        );

        songs = songsRaw.map(item => ({
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
      if (albumsResult.status === 'fulfilled') {
        const albumsRaw = albumsResult.value.data?.data || [];
        const albumGenres = await Promise.all(
          albumsRaw.map(album => album?.id ? getAlbumGenre(album.id) : "Unknown")
        );

        albums = albumsRaw.map((album, index) => ({
          id: album?.id,
          title: album?.title,
          artist: album?.artist?.name || "Unknown",
          cover: album?.cover,
          genre: albumGenres[index],
          isExplicit: album?.explicit_lyrics,
        }));
      }

      // ARTISTS
      if (artistsResult.status === 'fulfilled') {
        const artistsRaw = artistsResult.value.data?.data || [];
        artists = artistsRaw.map(artist => ({
          id: artist?.id,
          name: artist?.name,
          picture: artist?.picture,
          tracklist: artist?.tracklist,
        }));
      }

    } else {
      // === TYPE: SONGS ===
      if (typeKey === 'songs') {
        const songsRes = await callDeezer(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=15`);
        const songsRaw = songsRes.data?.data || [];
        const uniqueAlbumIds = [...new Set(songsRaw.map(item => item?.album?.id).filter(Boolean))];
        const albumGenresMap = new Map(
          await Promise.all(
            uniqueAlbumIds.map(async id => [id, await getAlbumGenre(id)])
          )
        );

        songs = songsRaw.map(item => ({
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
      if (typeKey === 'albums') {
        const albumsRes = await callDeezer(`https://api.deezer.com/search/album?q=${encodeURIComponent(query)}&limit=10`);
        const albumsRaw = albumsRes.data?.data || [];
        const albumGenres = await Promise.all(
          albumsRaw.map(album => album?.id ? getAlbumGenre(album.id) : "Unknown")
        );

        albums = albumsRaw.map((album, index) => ({
          id: album?.id,
          title: album?.title,
          artist: album?.artist?.name || "Unknown",
          cover: album?.cover,
          genre: albumGenres[index],
          isExplicit: album?.explicit_lyrics,
        }));
      }

      // === TYPE: ARTISTS ===
      if (typeKey === 'artists') {
        const artistsRes = await callDeezer(`https://api.deezer.com/search/artist?q=${encodeURIComponent(query)}&limit=10`);
        const artistsRaw = artistsRes.data?.data || [];

        artists = artistsRaw.map(artist => ({
          id: artist?.id,
          name: artist?.name,
          picture: artist?.picture,
          tracklist: artist?.tracklist,
        }));
      }
    }

    const responsePayload =
      typeKey === 'songs' ? { songs } :
      typeKey === 'albums' ? { albums } :
      typeKey === 'artists' ? { artists } :
      { songs, albums, artists };

    await redis.set(cacheKey, JSON.stringify(responsePayload), 'EX', 3600);
    res.json(responsePayload);
  } catch (error) {
    console.error("Error in searchMusic:", error.message);
    res.status(500).json({ message: "Search failed" });
  }
};

async function getAlbumGenre(albumId) {
  if (!albumId || typeof albumId !== 'number' || isNaN(albumId)) {
    return "Unknown";
  }
  
  const albumCacheKey = `album-genre:${albumId}`;
  const cachedGenre = await redis.get(albumCacheKey);
  if (cachedGenre) return cachedGenre;

  try {
    const albumDetails = await callDeezer(
      `https://api.deezer.com/album/${albumId}`
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
    await redis.set(albumCacheKey, genre, "EX", 86400);

    return genre;
  } catch (err) {
    console.error(`Failed to fetch genre for album ${albumId}:`, err.message);
    return "Unknown";
  }
};

async function getGenreFromId(genreId) {
  if (!genreId || genreId <= 0) return "Unknown";

  const cacheKey = `genre-id:${genreId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return cached;

  try {
    const genreResponse = await callDeezer(
      `https://api.deezer.com/genre/${genreId}`
    );
    const name = genreResponse.data?.name || null;

    await redis.set(cacheKey, name || "Unknown", 'EX', 86400); // cache even if "Unknown"
    return name || "Unknown";
  } catch (error) {
    console.error(
      `Failed to fetch genre name for ID ${genreId}:`,
      error.message
    );
    // Cache failure to avoid repeated retries
    await redis.set(cacheKey, "Unknown", 'EX', 86400);
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
    const trackResponse = await callDeezer(
      `https://api.deezer.com/track/${trackId}`
    );

    if (!trackResponse.data) {
      return res.status(404).json({ message: "Track not found" });
    }

    // Extract relevant details
    const trackData = trackResponse.data;

    // Check if album ID is available to fetch genre
    let genre = "Unknown";
    if (trackData.album?.id && typeof trackData.album.id === 'number') {
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

const getAlbumDetails = async (req, res) => {
  try {
    const { albumId } = req.params;

    if (!albumId) {
      return res.status(400).json({ message: "Album ID is required" });
    }

    // Fetch album details using rate-limited function
    const albumResponse = await callDeezer(
      `https://api.deezer.com/album/${albumId}`
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
          type: 'Song',
          genre: genre,
        })) || [],
        genre: genre,
        isExplicit: albumData.explicit_lyrics,
        preview: firstTrack?.preview || null
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
    const artistsResponse = await callDeezer(
      `https://api.deezer.com/artist/${artistId}/top?limit=25`
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
          type: 'Song'
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
        const response = await callDeezer(url);
        if (!response?.data?.data?.length) break;

        allAlbums.push(...response.data.data);
        index += limit;

        if (!response.data.next) break;
      }
    } else {
      const url = `https://api.deezer.com/artist/${artistId}/albums?limit=100&index=0`;
      const response = await callDeezer(url);
      if (response?.data?.data?.length) {
        allAlbums.push(...response.data.data);
      }
    }

    const allAlbumIds = allAlbums.map(album => album.id.toString());

    const existingIds = await Release.find({
      albumId: { $in: allAlbumIds },
      artistId
    }).distinct('albumId');

    const seen = new Set();

    const newAlbums = allAlbums.filter(album => {
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

    const recentlyChangedAlbums = allAlbums.filter(album => {
      const releaseDate = new Date(album.release_date);
      return releaseDate >= thirtyDaysAgo;
    });

    const recentlyChangedAlbumIds = recentlyChangedAlbums.map(a => a.id.toString());

    const existingRecentReleases = await Release.find({
      albumId: { $in: recentlyChangedAlbumIds },
      artistId,
      releaseDate: { $gte: thirtyDaysAgo }
    });

    const DEFAULT_COVER = 'https://res.cloudinary.com/drbccjuul/image/upload/e_improve:outdoor/m2bmgchypxctuwaac801';
    const DEFAULT_TITLE = 'Untitled Album';
    const DEFAULT_RELEASE_DATE = new Date('1970-01-01');

    const updates = [];

    for (const album of recentlyChangedAlbums) {
      const existing = existingRecentReleases.find(r => r.albumId === album.id.toString());
      if (!existing) continue;

      const updatedFields = {};

      const title = album.title?.trim() || DEFAULT_TITLE;
      const cover = album.cover?.trim() || DEFAULT_COVER;
      const releaseDate = album.release_date ? new Date(album.release_date) : DEFAULT_RELEASE_DATE;

      if (title !== existing.title) updatedFields.title = title;
      if (cover !== existing.cover) updatedFields.cover = cover;
      if (releaseDate.getTime() !== new Date(existing.releaseDate).getTime()) {
        updatedFields.releaseDate = releaseDate;
      }

      if (Object.keys(updatedFields).length > 0) {
        updates.push({
          updateOne: {
            filter: { _id: existing._id },
            update: { $set: updatedFields }
          }
        });
      }
    }

    if (updates.length > 0) {
      await Release.bulkWrite(updates);
      console.log(`Updated ${updates.length} recent/future albums for ${artistName} (${artistId})`);
    }

    if (newAlbums.length === 0) {
      console.log(`No new albums for ${artistName} (${artistId})`);
      return;
    }

    const docsToInsert = newAlbums.map(album => ({
      albumId: album.id,
      artistId,
      artistName,
      title: album.title?.trim() || DEFAULT_TITLE,
      cover: album.cover?.trim() || DEFAULT_COVER,
      isExplicit: !!album.explicit_lyrics,
      releaseDate: album.release_date ? new Date(album.release_date) : DEFAULT_RELEASE_DATE,
    }));

    await Release.insertMany(docsToInsert);
    console.log(`Inserted ${newAlbums.length} albums for ${artistName} (${artistId})`);
  } catch (err) {
    console.error(`syncArtistAlbums failed for artist ${artistId} (${artistName}):`, err.message || err);
    throw err;
  }
}

// When a user manually triggers album sync for an artist (following an artist)
const getAndStoreArtistAlbums = async (req, res) => {

  if (!req.user || !req.user._id) {
    return res.status(401).json({ message: 'Unauthorized. User not found.' });
  }
  const artistId = req.params.id;
  const artistName = req.query.name;

  const redisKey = `artist-sync:user:${artistId}`;
  const cached = await redis.get(redisKey);
  if (cached) return res.status(200).json({ message: 'Recently synced' });

  await syncArtistAlbums(artistId, artistName, true);
  await redis.set(redisKey, '1', 'EX', 60 * 60 * 6); // 6h TTL

  res.status(200).json({ message: 'Synced from user action' });
};

// Cron job method to update all followed artists' albums
async function cronSyncAllArtists(batchSize = 10, delayMs = 1000) {
  const followedArtists = await getFollowedArtistList();
  let totalSynced = 0;

  for (let i = 0; i < followedArtists.length; i += batchSize) {
    const batch = followedArtists.slice(i, i + batchSize);

    const syncBatch = batch.map(({ id, name }) => {
      return (async () => {
        const redisKey = `artist-sync:cron:${id}`;
        const cached = await redis.get(redisKey);
        if (cached) return { id, name, status: 'skipped' };

        try {
          await syncArtistAlbums(id, name);
          await redis.set(redisKey, '1', 'EX', 60 * 60 * 25);
          return { id, name, status: 'synced' };
        } catch (err) {
          console.error(`Cron sync failed for ${name} (${id}):`, err.message || err);
          return { id, name, status: 'failed', error: err.message || err };
        }
      })();
    });

    const results = await Promise.allSettled(syncBatch);

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { status } = result.value;
        if (status === 'synced') totalSynced += 1;
      } else {
        console.error(`Unhandled sync rejection:`, result.reason);
      }
    }

    // Log per batch
    console.log(`Processed batch ${i / batchSize + 1} of ${Math.ceil(followedArtists.length / batchSize)}`);

    // Delay between batches
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  console.log(`Cron sync completed. Total artists: ${followedArtists.length}, Synced: ${totalSynced}`);
}

// Helper function to get the list of followed artists from MongoDB
async function getFollowedArtistList() {
  const users = await User.find({}, 'artistList').lean();

  const allFollows = users.flatMap(u => u.artistList || []);

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
      return res.status(400).json({ message: 'artistIds must be a non-empty array' });
    }

    const query = {
      artistId: { $in: artistIds }
    };

    // If a cursor is provided, apply compound pagination logic
    if (cursorDate && cursorId) {
      query.$or = [
        { releaseDate: { $lt: new Date(cursorDate) } },
        {
          releaseDate: new Date(cursorDate),
          _id: { $lt: cursorId }
        }
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
      nextCursor
    });

  } catch (err) {
    console.error('Error fetching releases:', err.message || err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Fetch all Deezer artist releases (fully sorted, all pages)
const getDeezerArtistReleases = async (req, res) => {
  const { artistId } = req.params;
  const artistName = req.query.artistName || '';

  if (!artistId) {
    return res.status(400).json({ message: 'artistId is required' });
  }

  try {
    let allAlbums = [];
    let nextUrl = `https://api.deezer.com/artist/${artistId}/albums?limit=100&index=0`;

    // Keep fetching until there are no more pages
    while (nextUrl) {
      const response = await callDeezer(nextUrl);
      const data = response?.data?.data;

      if (!data || data.length === 0) break;

      allAlbums = allAlbums.concat(data);
      nextUrl = response?.data?.next || null;
    }

    // Normalize and filter bad/missing dates
    const albums = allAlbums
      .map(album => ({
        id: album.id,
        title: album.title,
        artist: artistName,
        cover: album.cover,
        releaseDate: album.release_date,
        isExplicit: album.explicit_lyrics || false,
      }))
      .filter(a => a.releaseDate && !isNaN(new Date(a.releaseDate)))
      .sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate)); // Descending

    return res.status(200).json({
      albums,
      next: null, // no pagination — you already have all of them
    });
  } catch (err) {
    console.error(`Error fetching Deezer releases for artist ${artistId}:`, err.message || err);
    return res.status(500).json({ message: 'Failed to fetch artist releases' });
  }
};

module.exports = {
  searchMusic,
  getAlbumGenre,
  getGenreFromId,
  getTrackDetails,
  getAlbumDetails,
  getArtistTopTracks,
  callDeezer,
  getAndStoreArtistAlbums,
  cronSyncAllArtists,
  getReleasesByArtistIds,
  getDeezerArtistReleases
};