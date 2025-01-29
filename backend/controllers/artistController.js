exports.getAllArtists = (req, res) => {
    res.json({ message: "Get all artists endpoint" });
};

exports.getArtistById = (req, res) => {
    res.json({ message: "Get artist by ID endpoint" });
};

exports.createArtist = (req, res) => {
    res.json({ message: "Create artist endpoint" });
};
