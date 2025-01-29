exports.getAllSongs = (req, res) => {
    res.json({ message: "Get all songs endpoint" });
};

exports.getSongById = (req, res) => {
    res.json({ message: "Get song by ID endpoint" });
};

exports.createSong = (req, res) => {
    res.json({ message: "Create song endpoint" });
};
