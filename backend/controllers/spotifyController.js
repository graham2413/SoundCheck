const axios = require("axios");
const User = require("../models/User");
const AlbumImage = require("../models/AlbumImage");
const getSpotifyAccessToken = require("../auth/spotifyAuth");

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

// Fetch top 25 albums from Spotify and store them in the database (runs once a week)
exports.setAlbumImages = async (req, res) => {
    try {
        const accessToken = await getSpotifyAccessToken();
        if (!accessToken) {
            console.error("Failed to get Spotify access token.");
            return;
        }
        
        // Get the current year dynamically
        const currentYear = new Date().getFullYear();

        // Fetch albums released in the current year (2025)
        const response = await axios.get("https://api.spotify.com/v1/search", {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: {
                q: `year:${currentYear} tag:new`, // Only new & recent albums from this year
                type: "album",
                limit: 50,
            },
        });

        const albums = response.data.albums.items.map(album => ({
            spotifyId: album.id,
            name: album.name,
            artist: album.artists.map(a => a.name).join(", "),
            imageUrl: album.images[0]?.url || "",
            releaseDate: album.release_date || "0000-00-00"
        }));

        // Sort albums by release date (newest first)
        albums.sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate));

        await AlbumImage.deleteMany({});
        await AlbumImage.insertMany(albums);
        return res.status(200).json({ message: "Album images updated successfully." });

    } catch (error) {
        console.error("error fetching popular albums:", error.response?.data || error.message);
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
