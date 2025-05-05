const redis = require('../utils/redisClient');
const { callDeezer } = require('../utils/callDeezer');

exports.searchMusic = async (req, res) => {
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

exports.getTrackDetails = async (req, res) => {
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

exports.getAlbumDetails = async (req, res) => {
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

exports.getArtistTopTracks = async (req, res) => {
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

    // In-memory cache for per-request deduplication
    const genreCache = new Map();
    const artistTopTrackData = artistsResponse.data.data;

    const artistTopTrackDetails = await Promise.all(
      artistTopTrackData.map(async (track) => {
        const albumId = track.album?.id;
        let genre = "Unknown";

        if (albumId && typeof albumId === 'number') {
          if (genreCache.has(albumId)) {
            genre = genreCache.get(albumId);
          } else {
            genre = await getAlbumGenre(albumId);
            genreCache.set(albumId, genre);
          }
        }

        return {
          id: track.id,
          title: track.title,
          artist: track.artist?.name || "Unknown",
          album: track.album?.title || "Unknown",
          duration: track.duration,
          preview: track.preview,
          isExplicit: track.explicit_lyrics,
          cover: track.album?.cover,
          genre,
          type: 'Song'
        };
      })
    );

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

module.exports.callDeezer = callDeezer; // for testing file access