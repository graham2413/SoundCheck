const axios = require("axios");
const https = require("https");
const fs = require("fs");
const path = require("path");

// Determine environment
const isProd = process.env.NODE_ENV === "production";

// Create HTTPS agent with CA cert in development
const agent = isProd
  ? new https.Agent()
  : new https.Agent({
    ca: fs.existsSync(path.resolve(__dirname, "../cacert.pem")) ? fs.readFileSync(path.resolve(__dirname, "../cacert.pem")) : undefined
    });

const getSpotifyAccessToken = async () => {
  try {
    const response = await axios.post(
      "https://accounts.spotify.com/api/token",
      new URLSearchParams({ grant_type: "client_credentials" }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(
            `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
          ).toString("base64")}`,
        },
        httpsAgent: agent, // Use custom agent
      }
    );

    return response.data.access_token;
  } catch (error) {
    console.error(
      "Error fetching Spotify access token:",
      error.response?.data || error.message
    );
    return null;
  }
};

module.exports = getSpotifyAccessToken;
