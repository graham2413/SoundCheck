const mongoose = require("mongoose");

const artistSchema = new mongoose.Schema({
    name: String,
    genre: String,
    albums: [{ type: mongoose.Schema.Types.ObjectId, ref: "Album" }],
    songs: [{ type: mongoose.Schema.Types.ObjectId, ref: "Song" }]
});

module.exports = mongoose.model("Artist", artistSchema);