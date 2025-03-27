const axios = require("axios");

const getSpotifyAccessToken = async () => {
    try {
        const response = await axios.post(
            "https://accounts.spotify.com/api/token",
            new URLSearchParams({ grant_type: "client_credentials" }), // Client Credentials Flow
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Authorization: `Basic ${Buffer.from(
                        `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
                    ).toString("base64")}`,
                },
            }
        );

        return response.data.access_token; // Return the access token
    } catch (error) {
        console.error("Error fetching Spotify access token:", error.response?.data || error.message);
        return null;
    }
};

module.exports = getSpotifyAccessToken;
