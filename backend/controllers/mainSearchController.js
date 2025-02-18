const axios = require("axios");
const https = require("https");

exports.searchMusic = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ message: "Query is required" });
    }

    // Custom HTTPS Agent to bypass SSL issues for Deezer requests
    const agent = new https.Agent({
      rejectUnauthorized: false,
    });

    // Run three separate searches in parallel
    const [songsResponse, albumsResponse, artistsResponse] = await Promise.all([
      axios.get(
        `https://api.deezer.com/search?q=${encodeURIComponent(query)}`,
        { httpsAgent: agent }
      ), // Song Search
      axios.get(
        `https://api.deezer.com/search/album?q=${encodeURIComponent(query)}`,
        { httpsAgent: agent }
      ), // Album Search
      axios.get(
        `https://api.deezer.com/search/artist?q=${encodeURIComponent(query)}`,
        { httpsAgent: agent }
      ), // Artist Search
    ]);

    // Process Songs
    const songs = songsResponse.data.data.map((item) => ({
      id: item.id,
      title: item.title,
      artist: item.artist.name,
      album: item.album.title,
      cover: item.album.cover,
      preview: item.preview,
    }));

    // Process Albums → Filter albums to include only those with the search term in the title
    const albums = albumsResponse.data.data
      .filter((album) =>
        album.title.toLowerCase().includes(query.toLowerCase())
      ) // Keep only matching titles
      .map((album) => ({
        id: album.id,
        title: album.title,
        artist: album.artist.name,
        cover: album.cover,
        release_date: album.release_date,
      }));

    // Process Artists (No Duplicates)
    const artists = artistsResponse.data.data.map((artist) => ({
      id: artist.id,
      name: artist.name,
      picture: artist.picture,
    }));

    res.json({ songs, albums, artists });
  } catch (error) {
    console.error("Error fetching music:", error.message);
    res.status(500).json({ message: "Failed to fetch music data" });
  }
};
