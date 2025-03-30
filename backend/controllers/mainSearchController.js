const axios = require("axios");
const https = require("https");
const Redis = require("ioredis");
const crypto = require("crypto");
 const fs = require('fs');

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
  tls: {} // Required for Upstash SSL
});

redis.on('error', (err) => {
  console.error("❌ Redis connection error:", err);
});

redis.on('connect', () => console.log("✅ Redis connected"));

async function callDeezer(url) {
  const key = `deezer-rate-limit`;
  const now = Math.floor(Date.now() / 1000);
  let retries = 0;

  while (true) {
    await redis.zremrangebyscore(key, "-inf", now - 5);
    const requests = await redis.zcard(key);

    if (requests < 50) {
      // Atomically add request and set expiration if needed
      const requestId = `${now}:${crypto.randomUUID()}`;
      await redis.multi().zadd(key, now, requestId).expire(key, 5).exec();

      break;
    }

    if (retries >= 10) {
      console.error(`Max retries reached, dropping request: ${url}`);
      return { data: { data: [] } };
    }

    const waitTime = (retries + 1) * 500; // Increasing wait time (500ms, 1s, 1.5s, ...)
    await new Promise((resolve) => setTimeout(resolve, waitTime));

    retries++;
  }

  // HTTPS agent
  let agent;

  if (process.env.NODE_ENV === 'production') {
    agent = new https.Agent();
  } else {
    agent = new https.Agent({
      ca: fs.readFileSync('cacert.pem'),
    });
  }

  let attempt = 0;
  while (attempt < 5) {
    try {
      const response = await axios.get(url, { httpsAgent: agent });

      // Handle Deezer Quota Limit (Code 4)
      if (response.data?.error?.code === 4) {
        await new Promise((resolve) =>
          setTimeout(resolve, 2 ** attempt * 1000)
        ); // Exponential backoff
        attempt++;
        continue; // Retry again
      }

      if (!response.data) {
        console.error(
          `⚠️ Invalid response from Deezer: ${JSON.stringify(response.data)}`
        );
        return { data: { data: [] } };
      }

      return response;
    } catch (error) {
      console.error(
        `Deezer API error [${attempt + 1}/5]:`,
        url,
        error.response?.status,
        error.message,
        error?.stack
      );
      await new Promise((res) => setTimeout(res, 2 ** attempt * 1000)); // Exponential backoff
      attempt++;
    }
  }

  console.error(`All attempts failed for ${url}`);
  return { data: { data: [] } };
}

exports.searchMusic = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ message: "Query is required" });
    }

    // Run three separate searches in parallel using rate-limited function
    const [songsResult, albumsResult, artistsResult] = await Promise.allSettled(
      [
        callDeezer(
          `https://api.deezer.com/search?q=${encodeURIComponent(query)}`
        ), // Songs
        callDeezer(
          `https://api.deezer.com/search/album?q=${encodeURIComponent(query)}`
        ), // Albums
        callDeezer(
          `https://api.deezer.com/search/artist?q=${encodeURIComponent(query)}`
        ), // Artists
      ]
    );

    // Extract only fulfilled values, set empty results for failed requests
    const songsResponse =
      songsResult.status === "fulfilled"
        ? songsResult.value
        : { data: { data: [] } };
    const albumsResponse =
      albumsResult.status === "fulfilled"
        ? albumsResult.value
        : { data: { data: [] } };
    const artistsResponse =
      artistsResult.status === "fulfilled"
        ? artistsResult.value
        : { data: { data: [] } };

    /** Process Songs */
    // Fetch album genres once for unique album IDs to avoid redundant API calls
    const uniqueAlbumIds = [
      ...new Set(
        songsResponse.data?.data.map((item) => item?.album?.id).filter(Boolean)
      ),
    ];

    const albumGenresMap = new Map(
      await Promise.all(
        uniqueAlbumIds.map(async (albumId) => [
          albumId,
          await getAlbumGenre(albumId),
        ])
      )
    );

    const songGenres = songsResponse.data?.data.map(
      (item) => albumGenresMap.get(item?.album?.id) || "Unknown"
    );

    // Attach genres to songs
    const songs = (songsResponse.data?.data || []).map((item, index) => ({
      id: item?.id,
      title: item?.title,
      artist: item?.artist?.name,
      album: item?.album?.title,
      cover: item?.album?.cover,
      preview: item?.preview,
      isExplicit: item?.explicit_lyrics,
      genre: songGenres[index],
    }));

    /** Process Albums */
    // Parallelize genre fetching for albums
    const albumGenres = await Promise.all(
      (albumsResponse.data?.data || []).map((album) =>
        album?.id ? getAlbumGenre(album.id) : "Unknown"
      )
    );

    // Attach genres to albums
    const albums = (albumsResponse.data?.data || []).map((album, index) => ({
      id: album?.id,
      title: album?.title,
      artist: album?.artist?.name || "Unknown",
      cover: album?.cover,
      genre: albumGenres[index],
    }));

    /** Process Artists */
    const artists = (artistsResponse.data?.data || []).map((artist) => ({
      id: artist?.id,
      name: artist?.name,
      picture: artist?.picture,
      tracklist: artist?.tracklist,
    }));

    res.json({ songs, albums, artists });
  } catch (error) {
    console.error("Error fetching music:", error.message);
    res.status(500).json({ message: "Failed to fetch music data" });
  }
};

async function getAlbumGenre(albumId) {
  if (!albumId) return "Unknown";

  // Check if genre is cached in Redis
  const cachedGenre = await redis.get(`album-genre:${albumId}`);
  if (cachedGenre) {
    return cachedGenre;
  }

  try {
    const albumDetails = await callDeezer(
      `https://api.deezer.com/album/${albumId}`
    );

    if (!albumDetails.data) {
      console.error(`Missing data in album details for album ${albumId}`);
      return "Unknown";
    }

    // Try to get genre from genres.data
    const genresArray = albumDetails.data.genres?.data;
    let genre = genresArray?.length ? genresArray[0].name : null;

    // Fallback: Use genre_id if no genre found and genre_id is valid
    if (
      !genre &&
      albumDetails.data.genre_id &&
      albumDetails.data.genre_id > 0
    ) {
      genre = await getGenreFromId(albumDetails.data.genre_id);
    }

    // If still no genre, return "Unknown"
    if (!genre) {
      genre = "Unknown";
    }

    // Store in Redis cache with expiration (e.g., 1 day)
    await redis.set(`album-genre:${albumId}`, genre, "EX", 86400);

    return genre;
  } catch (err) {
    console.error(`Failed to fetch genre for album ${albumId}:`, err.message);
    return "Unknown";
  }
}

async function getGenreFromId(genreId) {
  if (!genreId || genreId <= 0) return null;

  try {
    const genreResponse = await callDeezer(
      `https://api.deezer.com/genre/${genreId}`
    );
    return genreResponse.data?.name || null;
  } catch (error) {
    console.error(
      `Failed to fetch genre name for ID ${genreId}:`,
      error.message
    );
    return null;
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
    const trackDetails = {
      id: trackData.id,
      preview: trackData.preview,
      releaseDate: trackData.release_date || "Unknown",
      duration: trackData.duration, // in seconds
      albumTitle: trackData.album?.title || "Unknown",
      contributors: trackData.contributors
        ? trackData.contributors.map((c) => c.name)
        : [],
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
    const albumDetails = {
      id: albumData.id,
      releaseDate: albumData.release_date || "Unknown",
      tracklist:
        albumData.tracks?.data?.map((track) => ({
          id: track.id,
          title: track.title,
          duration: track.duration,
        })) || [],
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

    // Extract relevant details
    const artistTopTrackData = artistsResponse.data.data;
    const artistTopTrackDetails = artistTopTrackData.map((track) => ({
      id: track.id,
      title: track.title ?? "Unknown Title",
      duration: track.duration ?? 0,
      isExplicit: track.explicit_lyrics,
    }));

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
