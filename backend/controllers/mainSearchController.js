const axios = require("axios");
const https = require("https");

const LRU = require('lru-cache');

const albumGenreCache = new LRU({
  max: 5000, // Store only the last 5000 albums
  ttl: 1000 * 60 * 60 * 24, // Expire after 24 hours
});

exports.searchMusic = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ message: "Query is required" });
    }

    const agent = new https.Agent({ rejectUnauthorized: false });

    // Run three separate searches in parallel
    const [songsResult, albumsResult, artistsResult] = await Promise.allSettled(
      [
        axios.get(
          `https://api.deezer.com/search?q=${encodeURIComponent(query)}`,
          { httpsAgent: agent }
        ), // Songs
        axios.get(
          `https://api.deezer.com/search/album?q=${encodeURIComponent(query)}`,
          { httpsAgent: agent }
        ), // Albums
        axios.get(
          `https://api.deezer.com/search/artist?q=${encodeURIComponent(query)}`,
          { httpsAgent: agent }
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
    const uniqueAlbumIds = [...new Set(songsResponse.data?.data.map(item => item?.album?.id).filter(Boolean))];

    const albumGenresMap = new Map(
      await Promise.all(uniqueAlbumIds.map(async (albumId) => [albumId, await getAlbumGenre(albumId, agent)]))
    );
    
    const songGenres = songsResponse.data?.data.map((item) => albumGenresMap.get(item?.album?.id) || "Unknown");    

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
        album?.id ? getAlbumGenre(album.id, agent) : "Unknown"
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
      tracklist: artist?.tracklist
    }));

    res.json({ songs, albums, artists });
  } catch (error) {
    console.error("Error fetching music:", error.message);
    res.status(500).json({ message: "Failed to fetch music data" });
  }
};

async function getAlbumGenre(albumId, agent) {
  if (!albumId) return "Unknown"; // Prevent invalid API call
  if (albumGenreCache.has(albumId)) {
    return albumGenreCache.get(albumId) ?? "Unknown"; // Ensure `null` values don't cause issues
  }

  try {
    const albumDetails = await axios.get(`https://api.deezer.com/album/${albumId}`, {
      httpsAgent: agent,
    });
    
    const genre = albumDetails.data?.genres?.data?.length > 0
    ? albumDetails.data.genres.data[0].name
    : "Unknown";
    albumGenreCache.set(albumId, genre);

    return albumGenreCache.get(albumId) || "Unknown";
  } catch (err) {
    console.error(`Failed to fetch genre for album ${albumId}:`, err.message);
    albumGenreCache.set(albumId, "Unknown"); // Store failure state
    return "Unknown";
  }
}

exports.getTrackDetails = async (req, res) => {
  try {
    const agent = new https.Agent({ rejectUnauthorized: false });

    const { trackId } = req.params;
    
    if (!trackId) {
      return res.status(400).json({ message: "Track ID is required" });
    }

    // Fetch track details from Deezer API
    const trackResponse = await axios.get(`https://api.deezer.com/track/${trackId}`, { httpsAgent: agent });

    if (!trackResponse.data) {
      return res.status(404).json({ message: "Track not found" });
    }

    // Extract relevant details
    const trackData = trackResponse.data;
    const trackDetails = {
      id: trackData.id,
      releaseDate: trackData.release_date || "Unknown",
      duration: trackData.duration, // in seconds
    };

    return res.json(trackDetails);
  } catch (error) {
    console.error(`Error fetching track details for ID ${req.params.trackId}:`, error.message);
    return res.status(500).json({ message: "Failed to retrieve track details" });
  }
};

exports.getAlbumDetails = async (req, res) => {
  try {
    const agent = new https.Agent({ rejectUnauthorized: false });

    const { albumId } = req.params;

    if (!albumId) {
      return res.status(400).json({ message: "Album ID is required" });
    }

    // Fetch album details from Deezer API
    const albumResponse = await axios.get(`https://api.deezer.com/album/${albumId}`, { httpsAgent: agent });

    if (!albumResponse.data) {
      return res.status(404).json({ message: "Album not found" });
    }

    // Extract relevant details
    const albumData = albumResponse.data;
    const albumDetails = {
      id: albumData.id,
      releaseDate: albumData.release_date || "Unknown",
      tracklist: albumData.tracks?.data?.map(track => ({
        id: track.id,
        title: track.title,
        duration: track.duration,
      })) || [],
    };

    return res.json(albumDetails);
  } catch (error) {
    console.error(`Error fetching album details for ID ${req.params.albumId}:`, error.message);
    return res.status(500).json({ message: "Failed to retrieve album details" });
  }
};