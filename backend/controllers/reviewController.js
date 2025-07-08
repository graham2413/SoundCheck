const Review = require("../models/Review");
const User = require("../models/User");
const https = require("https");
const fetch = require("node-fetch");
const fs = require("fs");
const mongoose = require("mongoose");
const { getCanonicalId } = require("../utils/canonical-id");

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

    let canonicalId = null;

    if (
      albumSongOrArtist.type === "Song" ||
      albumSongOrArtist.type === "Album"
    ) {
      if (!albumSongOrArtist.title || !albumSongOrArtist.artist) {
        return res
          .status(400)
          .json({ message: "Title and artist are required." });
      }

      canonicalId = getCanonicalId(
        albumSongOrArtist.title,
        albumSongOrArtist.artist
      );
    }

    // Check if the user has already submitted a review for this item
    let existingReview;

    if (albumSongOrArtist.type === "Artist") {
      // Fallback to ID-based check for artists
      existingReview = await Review.findOne({
        user: req.user._id,
        "albumSongOrArtist.id": albumSongOrArtist.id,
        "albumSongOrArtist.type": "Artist",
      });
    } else {
      // Canonical check for Song/Album
      existingReview = await Review.findOne({
        user: req.user._id,
        "albumSongOrArtist.canonicalId": canonicalId,
        "albumSongOrArtist.type": albumSongOrArtist.type,
      });
    }

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
        ...(albumSongOrArtist.type !== "Artist" && { canonicalId }),
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
    const populatedReview = await newReview.populate(
      "user",
      "username profilePicture"
    );

    res.status(201).json({
      message: "Review created successfully!",
      review: populatedReview,
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
    const { type, title, artist } = req.query;
    const userId = req.user.id;

    if (!type || !["Song", "Album", "Artist"].includes(type)) {
      return res.status(400).json({
        message: "Type (song, album, artist) is required and must be valid.",
      });
    }

    if (type === "Artist") {
      const reviews = await Review.find({
        "albumSongOrArtist.id": id,
        "albumSongOrArtist.type": type,
      }).populate("user", "username profilePicture");

      const userReview = await Review.findOne({
        user: userId,
        "albumSongOrArtist.id": id,
        "albumSongOrArtist.type": type,
      }).populate("user", "username profilePicture");

      return res.status(200).json({
        reviews,
        userReview,
      });
    }

    let canonicalId = null;

    // Step 1: Try to find anchor review by ID + type
    const anchorReview = await Review.findOne({
      "albumSongOrArtist.id": id,
      "albumSongOrArtist.type": type,
    });

    // Step 2: Get canonicalId (from DB or derived from title + artist)
    if (anchorReview?.albumSongOrArtist?.canonicalId) {
      canonicalId = anchorReview.albumSongOrArtist.canonicalId;
    } else if (title && artist) {
      canonicalId = getCanonicalId(title, artist);
    }

    if (!canonicalId) {
      return res.status(200).json({
        message: "No reviews found for this item.",
        reviews: [],
        userReview: null,
      });
    }

    // Step 3: Fetch reviews by canonicalId
    let reviews = await Review.find({
      "albumSongOrArtist.canonicalId": canonicalId,
      "albumSongOrArtist.type": type,
    }).populate("user", "username profilePicture");

    // Fallback: support older reviews with no canonicalId
    if (reviews.length === 0 && title && artist) {
      reviews = await Review.find({
        "albumSongOrArtist.title": title,
        "albumSongOrArtist.artist": artist,
        "albumSongOrArtist.type": type,
      }).populate("user", "username profilePicture");
    }

    // Step 4: Fetch current user's review
    const userReview = await Review.findOne({
      user: userId,
      "albumSongOrArtist.canonicalId": canonicalId,
      "albumSongOrArtist.type": type,
    }).populate("user", "username profilePicture");

    return res.status(200).json({
      reviews,
      userReview,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "An error occurred while fetching reviews.",
    });
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
      $addFields: {
        groupKey: {
          $cond: {
            if: { $in: [type, ["Song", "Album"]] },
            then: {
              $ifNull: [
                "$albumSongOrArtist.canonicalId",
                "$albumSongOrArtist.id",
              ],
            },
            else: "$albumSongOrArtist.id",
          },
        },
        wasAlbumTied: "$albumSongOrArtist.wasOriginallyAlbumButTreatedAsSingle",
      },
    },
    {
      $group: {
        _id: "$groupKey",
        avgRating: { $avg: "$rating" },
        count: { $sum: 1 },
        info: { $first: "$albumSongOrArtist" },
        allAlbumTied: { $min: "$wasAlbumTied" },
      },
    },
    {
      $match: { count: { $gte: 2 } },
    },
    {
      $sort: { avgRating: -1, count: -1 },
    },
    {
      $limit: 10,
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
        wasOriginallyAlbumButTreatedAsSingle: "$allAlbumTied",
      },
    },
  ]);
};

const isProd = process.env.NODE_ENV === "production";
const agent = isProd
  ? new https.Agent()
  : new https.Agent({
      ca: fs.existsSync("cacert.pem")
        ? fs.readFileSync("cacert.pem")
        : undefined,
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

exports.toggleLikeHandler = async (req, res) => {
  const reviewId = req.params.id;
  const userId = req.user._id;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Lock the document to avoid race conditions
    const review = await Review.findById(reviewId).session(session);

    if (!review) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Review not found" });
    }

    const alreadyLiked = review.likedBy.includes(userId);

    if (alreadyLiked) {
      // Unlike: Pull user from likedBy, decrement likes (min 0)
      review.likedBy.pull(userId);
      review.likes = Math.max(0, review.likes - 1);
    } else {
      // Like: Push user into likedBy, increment likes
      review.likedBy.push(userId);
      review.likes += 1;
    }

    await review.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      message: alreadyLiked ? "Unliked" : "Liked",
      likes: review.likes,
      likedByUser: !alreadyLiked,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("Like toggle failed:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
