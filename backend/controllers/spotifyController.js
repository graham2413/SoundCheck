const axios = require("axios");
const User = require("../models/User");
const AlbumImage = require("../models/AlbumImage");
const getSpotifyAccessToken = require("../auth/spotifyAuth");
const path = require("path");
const https = require("https");
const fs = require("fs");
const { getGenreFromId, callDeezer } = require('../controllers/mainSearchController');

const isProd = process.env.NODE_ENV === "production";
const httpsAgent = isProd
  ? new https.Agent()
  : new https.Agent({
      ca: fs.readFileSync(path.resolve(__dirname, "../cacert.pem")),
    });

 // Fetch a user's Spotify playlists.
exports.getUserPlaylists = async (req, res) => {
    try {
        const user = await User.findById(req.user._id); // Ensure latest user data

        if (!user || !user.spotifyAccessToken) {
            return res.status(401).json({ message: "Spotify account not linked" });
        }

        // Fetch user's playlists from Spotify API
        const response = await axios.get("https://api.spotify.com/v1/me/playlists", {
            headers: { Authorization: `Bearer ${user.spotifyAccessToken}`, httpsAgent: httpsAgent        },
        });

        res.json(response.data);
    } catch (error) {
        console.error("Error fetching Spotify playlists:", error.response?.data || error.message);
        res.status(500).json({ message: "Failed to fetch playlists" });
    }
};


// Fetches songs on each provided playlist (add func. to import into the database if not there.)
exports.importPlaylists = async (req, res) => {
    try {
        const { playlistIds } = req.body; // List of selected Spotify playlist IDs
        const user = await User.findById(req.user._id); // Fetch user

        if (!user || !user.spotifyAccessToken) {
            return res.status(401).json({ message: "Spotify account not linked" });
        }

        const importedSongs = [];

        // Loop through each playlist and fetch its tracks
        for (const playlistId of playlistIds) {
            const response = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
                headers: { Authorization: `Bearer ${user.spotifyAccessToken}` },
                httpsAgent: httpsAgent
            });

            // Extract and store track details
            response.data.items.forEach(item => {
                if (!item.track) return; // Handle missing tracks

                importedSongs.push({
                    spotifyId: item.track.id,
                    name: item.track.name,
                    artist: item.track.artists.map(artist => artist.name).join(", "),
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

// Fetch top 50 albums from Spotify and store them in the database (runs once a week)
exports.setAlbumImages = async (req, res) => {
    try {
      const accessToken = await getSpotifyAccessToken();
      if (!accessToken) {
        console.error("Failed to get Spotify access token.");
        return res.status(500).json({ message: "Failed to get Spotify access token." });
      }
  
      const currentYear = new Date().getFullYear();
  
      const response = await axios.get("https://api.spotify.com/v1/search", {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          q: `year:${currentYear} tag:new`,
          type: "album",
          limit: 50,
        },
        httpsAgent
      });
  
      const albums = (await Promise.all(
        response.data.albums.items.map(async (album) => {
          const name = album.name;
          const artistName = album.artists.map(a => a.name).join(", ");
          const releaseDate = album.release_date || "0000-00-00";
      
          try {
            const deezerSearchRes = await callDeezer(
                `https://api.deezer.com/search/album?q=${encodeURIComponent(`${name} ${artistName}`)}`
              );
      
            const matchedAlbum = deezerSearchRes.data.data?.find(a =>
              a.title.toLowerCase() === name.toLowerCase()
            );
      
            if (!matchedAlbum) return null;
      
            // Step 1: Fetch full Deezer album details
            const deezerAlbumRes = await callDeezer(`https://api.deezer.com/album/${matchedAlbum.id}`);
            const deezerAlbum = deezerAlbumRes.data;
      
            // Step 2: Resolve genre
            const genre = await getGenreFromId(deezerAlbum.genre_id);
      
            // Step 3: Prepare tracklist
            const tracklist = deezerAlbum.tracks?.data?.map(track => ({
              id: track.id,
              title: track.title,
              duration: track.duration,
              preview: track.preview,
              isExplicit: track.explicit_lyrics || false
            })) || [];
      
            // Step 4: Extract preview + isExplicit from first track
            const preview = tracklist.find(t => t.preview)?.preview || "";
            const isExplicit = tracklist.some(t => t.isExplicit);
      
            return {
              id: deezerAlbum.id,
              title: deezerAlbum.title,
              artist: deezerAlbum.artist?.name || artistName,
              cover: deezerAlbum.cover_medium || deezerAlbum.cover || "",
              releaseDate,
              tracklist,
              genre,
              type: "Album",
              isExplicit,
              preview
            };
      
          } catch (err) {
            console.warn(`Failed Deezer match for "${name}" by ${artistName}:`, err.message);
            return null;
          }
        })
      )).filter(album => album); // Only keep successfully enriched albums      
  
      // Sort albums by release date (newest first)
      albums.sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate));
  
      await AlbumImage.deleteMany({});
      await AlbumImage.insertMany(albums);
  
      return res.status(200).json({ message: "Album images updated successfully." });
  
    } catch (error) {
      console.error("Error fetching popular albums:", error.response?.data || error.message);
      return res.status(500).json({ message: "Error fetching or storing albums." });
    }
  };

// Retrieve stored album images from the database
exports.getAlbumImages = async (req, res) => {
    try {
        const albums = await AlbumImage.find({}, { _id: 0, spotifyId: 1, name: 1, artist: 1, imageUrl: 1 });

        if (!albums.length) {
            return res.status(404).json({ message: "No stored albums found" });
        }

        res.json({ albums });
    } catch (error) {
        console.error("Error retrieving stored album images:", error.message);
        res.status(500).json({ message: "Failed to retrieve stored albums" });
    }
};
