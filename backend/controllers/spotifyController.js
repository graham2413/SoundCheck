const axios = require("axios");
const User = require("../models/User");
const AlbumImage = require("../models/AlbumImage");
const getSpotifyAccessToken = require("../auth/spotifyAuth");
const path = require("path");
const https = require("https");
const fs = require("fs");
const { callDeezer } = require("../controllers/mainSearchController");
const { fetchWithRetry } = require("../utils/fetchWithRetry");

const isProd = process.env.NODE_ENV === "production";
const httpsAgent = isProd
  ? new https.Agent()
  : new https.Agent({
    ca: fs.existsSync(path.resolve(__dirname, "../cacert.pem")) ? fs.readFileSync(path.resolve(__dirname, "../cacert.pem")) : undefined
    });

// Fetch a user's Spotify playlists.
const getUserPlaylists = async (req, res) => {
  try {
    const user = await User.findById(req.user._id); // Ensure latest user data

    if (!user || !user.spotifyAccessToken) {
      return res.status(401).json({ message: "Spotify account not linked" });
    }

    // Fetch user's playlists from Spotify API
    const response = await axios.get(
      "https://api.spotify.com/v1/me/playlists",
      {
        headers: {
          Authorization: `Bearer ${user.spotifyAccessToken}`,
          httpsAgent: httpsAgent,
        },
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error(
      "Error fetching Spotify playlists:",
      error.response?.data || error.message
    );
    res.status(500).json({ message: "Failed to fetch playlists" });
  }
};

// Fetches songs on each provided playlist (add func. to import into the database if not there.)
const importPlaylists = async (req, res) => {
  try {
    const { playlistIds } = req.body; // List of selected Spotify playlist IDs
    const user = await User.findById(req.user._id); // Fetch user

    if (!user || !user.spotifyAccessToken) {
      return res.status(401).json({ message: "Spotify account not linked" });
    }

    const importedSongs = [];

    // Loop through each playlist and fetch its tracks
    for (const playlistId of playlistIds) {
      const response = await axios.get(
        `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
        {
          headers: { Authorization: `Bearer ${user.spotifyAccessToken}` },
          httpsAgent: httpsAgent,
        }
      );

      // Extract and store track details
      response.data.items.forEach((item) => {
        if (!item.track) return; // Handle missing tracks

        importedSongs.push({
          spotifyId: item.track.id,
          name: item.track.name,
          artist: item.track.artists.map((artist) => artist.name).join(", "),
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

// Fetch top albums from Spotify and store them in the database (runs once a week)
const setAlbumImages = async () => {
  try {
    const accessToken = await getSpotifyAccessToken();
    if (!accessToken) {
      console.error("Failed to get Spotify access token.");
      return false;
    }

    const currentYear = new Date().getFullYear();
    const allAlbums = [];

    // Step 1: Fetch up to 500 albums (10 pages of 50)
    for (let offset = 0; offset < 300; offset += 50) {
      const res = await axios.get("https://api.spotify.com/v1/search", {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          q: `year:${currentYear} tag:new`,
          type: "album",
          limit: 50,
          offset,
          market: "US",
        },
        httpsAgent,
      });
      allAlbums.push(...res.data.albums.items);
    }

    // Step 2: Collect unique artist IDs
    const artistIds = [
      ...new Set(allAlbums.flatMap((a) => a.artists.map((ar) => ar.id))),
    ];
    const popularArtistIds = new Set();
    const artistPopularityMap = new Map();

    for (let i = 0; i < artistIds.length; i += 50) {
      const batch = artistIds.slice(i, i + 50);
      const res = await axios.get("https://api.spotify.com/v1/artists", {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { ids: batch.join(",") },
        httpsAgent,
      });

      res.data.artists.forEach((artist) => {
        artistPopularityMap.set(artist.id, artist.popularity);
        if (artist.popularity >= 75) {
          popularArtistIds.add(artist.id);
        }
      });
    }

    // Step 3: Attach popularity to each album's artists
    allAlbums.forEach((album) => {
      album.artists.forEach((artist) => {
        artist.popularity = artistPopularityMap.get(artist.id) || 0;
      });
    });

    // Step 4: Filter albums based on artist popularity
    const filteredAlbums = allAlbums.filter((album) =>
      album.artists.some((artist) => popularArtistIds.has(artist.id))
    );

    // Step 5: Enrich via Deezer
    const albums = (
      await Promise.all(
        filteredAlbums.map(async (album) => {
          const name = album.name;
          const artistName = album.artists.map((a) => a.name).join(", ");
          const releaseDate = album.release_date || "0000-00-00";
          const maxPopularity = Math.max(
            ...album.artists.map((a) => a.popularity || 0)
          );

          try {
            const deezerSearchRes = await fetchWithRetry(() =>
              callDeezer(
                `https://api.deezer.com/search/album?q=${encodeURIComponent(`${name} ${artistName}`)}`
              )
            );

            const matchedAlbum = deezerSearchRes.data.data?.find(
              (a) => a.title.toLowerCase() === name.toLowerCase()
            );

            if (!matchedAlbum) return null;

            return {
              id: matchedAlbum.id,
              title: matchedAlbum.title,
              artist: matchedAlbum.artist?.name || artistName,
              cover: matchedAlbum.cover,
              releaseDate,
              type: "Album",
              isExplicit: matchedAlbum.explicit_lyrics || false,
              popularity: maxPopularity,
            };
          } catch (err) {
            console.warn(
              `Failed Deezer match for "${name}" by ${artistName}:`,
              err.message
            );
            return null;
          }
        })
      )
    ).filter((album) => album);

    // Step 6: Sort albums by release date (newest first), then popularity
    albums.sort((a, b) => {
      const dateDiff =
        new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime();
      if (dateDiff !== 0) return dateDiff;
      return (b.popularity || 0) - (a.popularity || 0);
    });

    // Step 7: Load existing albums before wiping
    const existingAlbums = await AlbumImage.find()
      .sort({ releaseDate: -1, popularity: -1 })
      .lean();

    // Clear out old records
    await AlbumImage.deleteMany({});
    console.log("After delete:", await AlbumImage.countDocuments());

    // Deduplicate new albums by ID
    let dedupedAlbums = Array.from(
      new Map(albums.map((album) => [album.id, album])).values()
    );

    // If less than 110, pull top existing albums as fallback
    if (dedupedAlbums.length < 110) {
      const needed = 110 - dedupedAlbums.length;

      const fallback = existingAlbums
        .filter((existing) => !dedupedAlbums.find((a) => a.id === existing.id))
        .slice(0, needed);

      dedupedAlbums = dedupedAlbums.concat(fallback);
    }

    // Final cap
    dedupedAlbums = dedupedAlbums.slice(0, 110);

    // Store final set
    await AlbumImage.insertMany(dedupedAlbums);

    return true;
  } catch (error) {
    console.error(
      "Error fetching popular albums:",
      error.response?.data || error.message
    );
    return false;
  }
};

// Retrieve stored album images from the database
const getAlbumImages = async (req, res) => {
  try {
    const albums = await AlbumImage.find({}).lean();

    if (!albums.length) {
      return res.status(404).json({ message: "No stored albums found" });
    }

    res.json({ albums });
  } catch (error) {
    console.error("Error retrieving stored album images:", error.message);
    res.status(500).json({ message: "Failed to retrieve stored albums" });
  }
};

module.exports = {
  getUserPlaylists,
  importPlaylists,
  getAlbumImages,
  setAlbumImages,
};
