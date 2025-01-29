const albumSchema = new mongoose.Schema({
    title: String,
    artist: { type: mongoose.Schema.Types.ObjectId, ref: "Artist" }, // Reference to Artist
    releaseYear: Number,
    genre: String,
    coverImage: String,
    songs: [{ type: mongoose.Schema.Types.ObjectId, ref: "Song" }] // Reference to Songs
});

module.exports = mongoose.model("Album", albumSchema);