const songSchema = new mongoose.Schema({
    title: String,
    artist: { type: mongoose.Schema.Types.ObjectId, ref: "Artist" }, // Reference to Artist
    album: { type: mongoose.Schema.Types.ObjectId, ref: "Album" }, // Reference to Album
    duration: String,
    genre: String,
    lyrics: String
});

module.exports = mongoose.model("Song", songSchema);
