exports.getAllAlbums = (req, res) => {
    res.json({ message: "Get all albums endpoint" });
};

exports.getAlbumById = (req, res) => {
    res.json({ message: "Get album by ID endpoint" });
};

exports.createAlbum = (req, res) => {
    res.json({ message: "Create album endpoint" });
};
