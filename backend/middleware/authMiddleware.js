const jwt = require("jsonwebtoken");
const User = require("../models/User");

const authenticateUser = async (req, res, next) => {
    const authHeader = req.header("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "No token, authorization denied" });
    }

    const token = authHeader.split(" ")[1]; // Extract token after "Bearer"

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET); // Verify token
        const userId = decoded.userId || decoded.user?._id;
        const user = await User.findById(userId).select("-password"); // // Exclude password

        if (!user) {
            return res.status(401).json({ message: "User not found" });
        }

        req.user = user; // Attach full user object to request
        next();
    } catch (error) {
        res.status(401).json({ message: "Invalid token", error: error });
    }
};

module.exports = authenticateUser;
