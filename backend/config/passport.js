const passport = require("passport");
const { Strategy: JwtStrategy, ExtractJwt } = require("passport-jwt");
const SpotifyStrategy = require("passport-spotify").Strategy;
const User = require("../models/User");
require("dotenv").config();
// process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; //change eventually

// JWT Strategy (for regular login)
const jwtOptions = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: process.env.JWT_SECRET
};

passport.use(new JwtStrategy(jwtOptions, async (payload, done) => {
    try {
        const user = await User.findById(payload.id);
        if (user) return done(null, user);
        return done(null, false);
    } catch (error) {
        return done(error, false);
    }
}));

// Spotify OAuth Strategy (Also acts as Signup method for non spotify users)
passport.use(new SpotifyStrategy(
    {
        clientID: process.env.SPOTIFY_CLIENT_ID,
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
        callbackURL: process.env.SPOTIFY_REDIRECT_URI
    },
    async (accessToken, refreshToken, expires_in, profile, done) => {

        try {
            let user = await User.findOne({ email: profile.emails?.[0]?.value });

            if (!user) {
                // If user does not exist, create a new one
                user = new User({
                    email: profile.emails?.[0]?.value || "",
                    spotifyId: profile.id,
                    profilePicture: profile.photos?.[0] || "",
                    spotifyAccessToken: accessToken,
                    spotifyRefreshToken: refreshToken,
                    displayName: profile.displayName || "Spotify User"
                });
                await user.save();
            } else {
                // If user already exists, just update their Spotify tokens
                user.spotifyAccessToken = accessToken;
                user.spotifyRefreshToken = refreshToken;
                user.spotifyId = profile.id; // Ensure Spotify ID is stored
                await user.save();
            }

            return done(null, user);
        } catch (error) {
            console.error("Error in Passport Strategy:", error);
            return done(error, false);
        }
    }
));



// Serialize and Deserialize User
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (error) {
        done(error, null);
    }
});

module.exports = passport;
