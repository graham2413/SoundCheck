const axios = require("axios");
const https = require("https");
const pLimit = require("p-limit");

const limit = pLimit(5); // Limit 5 concurrent requests at a time (to stay within 50 requests/5 seconds constraint)
const albumGenreCache = new Map(); // Cache fopr albumGenre's

exports.searchMusic = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ message: "Query is required" });
    }

    const agent = new https.Agent({ rejectUnauthorized: false });

    // Run three separate searches in parallel
    const [songsResult, albumsResult, artistsResult] = await Promise.allSettled([
      axios.get(`https://api.deezer.com/search?q=${encodeURIComponent(query)}`, { httpsAgent: agent }), // Songs
      axios.get(`https://api.deezer.com/search/album?q=${encodeURIComponent(query)}`, { httpsAgent: agent }), // Albums
      axios.get(`https://api.deezer.com/search/artist?q=${encodeURIComponent(query)}`, { httpsAgent: agent }) // Artists
    ]);


    // Extract only fulfilled values, set empty results for failed requests
    const songsResponse = songsResult.status === "fulfilled" ? songsResult.value : { data: { data: [] } };
    const albumsResponse = albumsResult.status === "fulfilled" ? albumsResult.value : { data: { data: [] } };
    const artistsResponse = artistsResult.status === "fulfilled" ? artistsResult.value : { data: { data: [] } };

    /** Process Songs */
    const songs = await Promise.all(
      (songsResponse.data?.data || []).map(async (item) => {
        const genre = item?.album?.id ? await getAlbumGenre(item.album.id, agent) : "Unknown";
        return {
          id: item?.id,
          title: item?.title,
          artist: item?.artist?.name,
          album: item?.album?.title,
          cover: item?.album?.cover,
          preview: item?.preview,
          isExplicit: item?.explicit_lyrics,
          genre,
        };
      })
    );

    /** Process Albums */
    const filteredAlbums = (albumsResponse.data?.data || []).filter((album) =>
      album?.title?.toLowerCase().includes(query.toLowerCase())
    );    

    const albums = await Promise.all(
      filteredAlbums.map(async (album) => {
        const genre = album?.id ? await getAlbumGenre(album.id, agent) : "Unknown";
        return {
          id: album?.id,
          title: album?.title,
          artist: album?.artist?.name || "Unknown",
          cover: album?.cover,
          release_date: album?.release_date || "Unknown",
          tracklist: album?.tracklist,
          genre,
        };
      })
    );

    /** Process Artists */
    const artists = await Promise.all(
      (artistsResponse.data?.data || []).map(async (artist) => {
        if (!artist?.id) {
          return {
            id: artist?.id || "Unknown",
            name: artist?.name || "Unknown",
            picture: artist?.picture || "",
            tracklist: artist?.tracklist || "",
            genre: "Unknown",
          };
        }
    
        try {
          const albumsResponse = await limit(() =>
            axios.get(`https://api.deezer.com/artist/${artist.id}/albums`, { httpsAgent: agent })
          );
    
          const albumsData = albumsResponse.data?.data || [];
          const topAlbum = albumsData.length ? albumsData[0] : null;
          const genre = topAlbum?.id ? await getAlbumGenre(topAlbum.id, agent) : "Unknown";
    
          return {
            id: artist?.id,
            name: artist?.name,
            picture: artist?.picture,
            tracklist: artist?.tracklist,
            genre,
          };
        } catch (err) {
          console.error(`Failed to fetch genre for artist ${artist?.id}:`, err.message);
          return {
            id: artist?.id,
            name: artist?.name,
            picture: artist?.picture,
            tracklist: artist?.tracklist,
            genre: "Unknown",
          };
        }
      })
    );    

    res.json({ songs, albums, artists });
  } catch (error) {
    console.error("Error fetching music:", error.message);
    res.status(500).json({ message: "Failed to fetch music data" });
  }
};

async function getAlbumGenre(albumId, agent) {
  if (!albumId || albumGenreCache.has(albumId)) {
    return albumGenreCache.get(albumId) || "Unknown"; // Prevent unnecessary calls
  }

  try {
    const albumDetails = await limit(() =>
      axios.get(`https://api.deezer.com/album/${albumId}`, { httpsAgent: agent })
    );
    const genre = albumDetails.data?.genres?.data?.[0]?.name || "Unknown";
    albumGenreCache.set(albumId, genre);
    return genre;
  } catch (err) {
    console.error(`Failed to fetch genre for album ${albumId}:`, err.message);
    albumGenreCache.set(albumId, "Unknown"); // Store failure state
    return "Unknown";
  }
}
