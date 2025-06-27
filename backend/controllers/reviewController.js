const Review = require("../models/Review");
const User = require("../models/User");

// Create a new review
exports.createReview = async (req, res) => {
  try {
    const { albumSongOrArtist, rating, reviewText } = req.body;

    if (
      !albumSongOrArtist ||
      !albumSongOrArtist.id ||
      !albumSongOrArtist.type
    ) {
      return res
        .status(400)
        .json({ message: "Album, Song, or Artist details are required." });
    }

    // Check if the user has already submitted a review for this item
    const existingReview = await Review.findOne({
      user: req.user._id,
      "albumSongOrArtist.id": albumSongOrArtist.id,
      "albumSongOrArtist.type": albumSongOrArtist.type,
    });

    if (existingReview) {
      return res.status(409).json({
        message: "You have already submitted a review for this item.",
        review: existingReview,
      });
    }

    // Create the new review object
    const newReview = new Review({
      user: req.user._id,
      albumSongOrArtist: {
        id: albumSongOrArtist.id,
        type: albumSongOrArtist.type,
        wasOriginallyAlbumButTreatedAsSingle:
          albumSongOrArtist.wasOriginallyAlbumButTreatedAsSingle || false,
        title: albumSongOrArtist.title,
        name: albumSongOrArtist.name,
        cover: albumSongOrArtist.cover || "",
        picture: albumSongOrArtist.picture || "",
        isExplicit: albumSongOrArtist.isExplicit || false,
        artist: albumSongOrArtist.artist,
        album: albumSongOrArtist.album || "",
        genre: albumSongOrArtist.genre || "",
      },
      rating,
      reviewText,
    });

    await newReview.save();

    // Populate the user details for the created review
    await newReview.populate("user", "username profilePicture");

    res.status(201).json({
      message: "Review created successfully!",
      review: newReview,
    });
  } catch (error) {
    res
      .status(400)
      .json({ message: error.message || "Error creating review." });
  }
};

// Get all reviews for an album/song/artist as well as the current user's review
exports.getReviewsWithUserReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.query;
    const user = req.user.id;

    // Check if type is provided and is valid
    if (!type || !["Song", "Album", "Artist"].includes(type)) {
      return res
        .status(400)
        .json({
          message: "Type (song, album, artist) is required and must be valid.",
        });
    }

    // Get all reviews for the song/album/artist (filter by both ID and type)
    const reviews = await Review.find({
      "albumSongOrArtist.id": id,
      "albumSongOrArtist.type": type,
    }).populate("user", "username profilePicture");

    // Get the current user's review (if it exists) for the specific type
    const userReview = await Review.findOne({
      "albumSongOrArtist.id": id,
      user,
      "albumSongOrArtist.type": type,
    }).populate("user", "username profilePicture");

    return res.status(200).json({
      reviews, // List of all reviews
      userReview, // Current user's review (if it exists)
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "An error occurred while fetching reviews." });
  }
};

// Edit a review (Only the review owner)
exports.editReview = async (req, res) => {
  try {
    const { rating, reviewText } = req.body;

    // Populate user from the start
    const review = await Review.findById(req.params.id).populate("user");

    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    if (review.user._id.toString() !== req.user._id.toString()) {
      return res
        .status(403)
        .json({ message: "Unauthorized to edit this review" });
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
      return res
        .status(403)
        .json({ message: "Unauthorized to delete this review" });
    }

    await review.deleteOne();
    res.json({ message: "Review deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error });
  }
};

// Get all reviews from user's friends (user's activity feed)
exports.getActivityFeed = async (req, res) => {
  try {
    const userId = req.user._id;
    const { cursorDate, cursorId, limit = 20 } = req.query;

    const user = await User.findById(userId).select("friends").lean();

    if (!user || user.friends.length === 0) {
      return res.status(200).json({ reviews: [], nextCursor: null });
    }

    const friendAndSelfIds = [...user.friends, userId];

    const query = { user: { $in: friendAndSelfIds } };

    // Apply cursor logic if present
    if (cursorDate && cursorId) {
      query.$or = [
        { createdAt: { $lt: new Date(cursorDate) } },
        {
          createdAt: new Date(cursorDate),
          _id: { $lt: cursorId },
        },
      ];
    }

    const reviews = await Review.find(query)
      .populate("user", "username profilePicture")
      .sort({ createdAt: -1, _id: -1 })
      .limit(Number(limit));

    // Get the next cursor from the last item
    const last = reviews[reviews.length - 1];
    const nextCursor = last
      ? {
          cursorDate: last.createdAt.toISOString(),
          cursorId: last._id,
        }
      : null;

    res.status(200).json({ reviews, nextCursor });
  } catch (error) {
    console.error("Error fetching friends' reviews:", error);
    res
      .status(500)
      .json({ message: "Server error while fetching friends' reviews." });
  }
};

// Methods to get top review by type (Album, Song, Artist)
exports.getTopAlbums = async (req, res) => {
  try {
    const albums = await getTopByType("Album");
    res.status(200).json({ albums });
  } catch (error) {
    console.error("Top Albums Error:", error);
    res.status(500).json({ message: "Failed to fetch top albums." });
  }
};

exports.getTopSongs = async (req, res) => {
  try {
    const songs = await getTopByType("Song");
    res.status(200).json({ songs });
  } catch (error) {
    console.error("Top Songs Error:", error);
    res.status(500).json({ message: "Failed to fetch top songs." });
  }
};

exports.getTopArtists = async (req, res) => {
  try {
    const artists = await getTopByType("Artist");
    res.status(200).json({ artists });
  } catch (error) {
    console.error("Top Artists Error:", error);
    res.status(500).json({ message: "Failed to fetch top artists." });
  }
};

// Helper function to get top reviews by type
const getTopByType = async (type) => {
  return await Review.aggregate([
    {
      $match: {
        "albumSongOrArtist.type": type,
        rating: { $ne: null },
      },
    },
    {
      $group: {
        _id: "$albumSongOrArtist.id",
        avgRating: { $avg: "$rating" },
        count: { $sum: 1 },
        info: { $first: "$albumSongOrArtist" },
      },
    },
    {
      $match: { count: { $gte: 2 } }, // Filter for at least 2 reviews (once more users update this)
    },
    {
      $sort: { avgRating: -1, count: -1 },
    },
    {
      $limit: 10, // Only shows the top 10 for now (can increment once more users)
    },
    {
      $project: {
        _id: 0,
        id: "$info.id",
        title: "$info.title",
        name: "$info.name",
        cover: "$info.cover",
        picture: "$info.picture",
        artist: "$info.artist",
        genre: "$info.genre",
        album: "$info.album",
        isExplicit: "$info.isExplicit",
        type: type,
        avgRating: { $round: ["$avgRating", 1] },
        reviewCount: "$count",
      },
    },
  ]);
};

const https = require("https");
const fetch = require("node-fetch");
const fs = require("fs");

const isProd = process.env.NODE_ENV === "production";
const agent = isProd
  ? new https.Agent()
  : new https.Agent({
    ca: fs.existsSync("cacert.pem") ? fs.readFileSync("cacert.pem") : undefined,
    });

exports.proxyImage = async function (req, res) {
  const imageUrl = req.query.url;
  if (!imageUrl) return res.status(400).send("Missing image URL");

  try {
    const response = await fetch(imageUrl, { agent });
    const contentType = response.headers.get("content-type") || "image/jpeg";

    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Credentials", "false");
    res.set("Access-Control-Expose-Headers", "*");
    res.set("Timing-Allow-Origin", "*");
    res.set("Content-Type", contentType);

    response.body.pipe(res);
  } catch (err) {
    console.error("Image proxy failed:", err);
    res.status(500).send("Failed to proxy image");
  }
};