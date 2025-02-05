const axios = require("axios");
const User = require("../models/User");
require("dotenv").config();

 // Fetch a user's Spotify playlists.
exports.getUserPlaylists = async (req, res) => {
    try {
        const user = await User.findById(req.user._id); // Ensure latest user data

        if (!user || !user.spotifyAccessToken) {
            return res.status(401).json({ message: "Spotify account not linked" });
        }

        // Fetch user's playlists from Spotify API
        const response = await axios.get("https://api.spotify.com/v1/me/playlists", {
            headers: { Authorization: `Bearer ${user.spotifyAccessToken}` },
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
