const Review = require("../models/Review");

// Create a new review
exports.createReview = async (req, res) => {
    try {
        const { albumSongOrArtist, rating, reviewText } = req.body;

        if (!albumSongOrArtist || !albumSongOrArtist.id || !albumSongOrArtist.type) {
            return res.status(400).json({ message: "Album, Song, or Artist details are required." });
        }
        
        // Create the new review object using the full `albumSongOrArtist` details
        const newReview = new Review({
            user: req.user._id,
            albumSongOrArtist: {
                id: albumSongOrArtist.id,
                type: albumSongOrArtist.type,
                title: albumSongOrArtist.title,
                name: albumSongOrArtist.name,
                cover: albumSongOrArtist.cover || "",
                picture: albumSongOrArtist.picture || "",
                isExplicit: albumSongOrArtist.isExplicit || false,
                artist: albumSongOrArtist.artist,
                album: albumSongOrArtist.album || ""
            },
            rating,
            reviewText
        });

        // Save the new review
        await newReview.save();

        // Populate the user details for the created review
        await newReview.populate('user', 'username profilePicture');

        res.status(201).json({
            message: "Review created successfully!",
            review: newReview
        });
    } catch (error) {
        res.status(400).json({ message: error.message || "Error creating review." });
    }
};


// Get all reviews for an album/song/artist as well as the current user's review
exports.getReviewsWithUserReview = async (req, res) => {
    try {
        const { id } = req.params;
        const { type } = req.query;
        const user = req.user.id;

        // Check if type is provided and is valid
        if (!type || !['Song', 'Album', 'Artist'].includes(type)) {
            return res.status(400).json({ message: "Type (song, album, artist) is required and must be valid." });
        }

        // Get all reviews for the song/album/artist (filter by both ID and type)
        const reviews = await Review.find({ "albumSongOrArtist.id": id, "albumSongOrArtist.type": type }).populate("user", "username profilePicture");

        // Get the current user's review (if it exists) for the specific type
        const userReview = await Review.findOne({ "albumSongOrArtist.id": id, user, "albumSongOrArtist.type": type }).populate("user", "username profilePicture");

        return res.status(200).json({
            reviews,        // List of all reviews
            userReview      // Current user's review (if it exists)
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "An error occurred while fetching reviews." });
    }
};


// Edit a review (Only the review owner)
exports.editReview = async (req, res) => {
    try {
      const { rating, reviewText } = req.body;
  
      // Populate user from the start
      const review = await Review.findById(req.params.id).populate('user');
  
      if (!review) {
        return res.status(404).json({ message: "Review not found" });
      }
  
      if (review.user._id.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: "Unauthorized to edit this review" });
      }
  
      if (rating !== undefined) review.rating = rating;
      if (reviewText !== undefined) review.reviewText = reviewText;
      review.createdAt = new Date();
  
      await review.save();
  
      // Return the same populated object
      res.json({ message: "Review updated successfully", review });
    } catch (error) {
      res.status(500).json({ message: "Server Error", error });
    }
  };
  

// Delete a review (Only the review owner)
exports.deleteReview = async (req, res) => {
    try {
        const review = await Review.findById(req.params.id);

        if (!review) {
            return res.status(404).json({ message: "Review not found" });
        }

        // Ensure the user is the owner
        if (review.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: "Unauthorized to delete this review" });
        }

        await review.deleteOne();
        res.json({ message: "Review deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server Error", error: error });
    }
};
