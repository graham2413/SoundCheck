
const request = require("supertest");
const express = require("express");
const Review = require("../models/Review");
const reviewController = require("../controllers/reviewController");

// Setup mock Express app and middleware
const app = express();
app.use(express.json());

// Simulate auth middleware for all requests
app.use((req, res, next) => {
    req.user = { _id: 'user123', id: 'user123' }; // match your mock data
    next();
  });

// Define routes
app.post("/api/reviews", reviewController.createReview);
app.get("/api/reviews/:id", reviewController.getReviewsWithUserReview);
app.put("/api/reviews/:id", reviewController.editReview);
app.delete("/api/reviews/:id", reviewController.deleteReview);

// Mock Mongoose model
jest.mock("../models/Review");

beforeEach(() => {
    jest.clearAllMocks();
  });  

// Create test group
describe("POST /api/reviews (createReview)", () => {
  it("should return 400 if albumSongOrArtist is missing", async () => {
    const res = await request(app).post("/api/reviews").send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Album, Song, or Artist details are required.");
  });

  it("should create and return the new review", async () => {
    const mockSave = jest.fn().mockResolvedValue();
    const mockPopulate = jest.fn().mockResolvedValue({
      user: { username: "testuser", profilePicture: "" },
    });
    const mockReview = {
      save: mockSave,
      populate: mockPopulate,
    };
    Review.mockImplementation(() => mockReview);

    const res = await request(app).post("/api/reviews").send({
      albumSongOrArtist: { id: "1", type: "Album", title: "Test Album" },
      rating: 4,
      reviewText: "Good album",
    });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe("Review created successfully!");
  });

  it("should create review even if optional fields are missing", async () => {
    const mockSave = jest.fn().mockResolvedValue();
    const mockPopulate = jest.fn().mockResolvedValue({
      user: { username: "testuser", profilePicture: "" },
    });
    const mockReview = {
      save: mockSave,
      populate: mockPopulate,
    };
    Review.mockImplementation(() => mockReview);
  
    const res = await request(app).post("/api/reviews").send({
      albumSongOrArtist: { id: "1", type: "Song", title: "Test Song" }, // no cover/picture/etc.
      rating: 5,
      reviewText: "Minimal data test",
    });
  
    expect(res.status).toBe(201);
    expect(res.body.review).toBeDefined();
  });
});

// Get test group
describe("GET /api/reviews/:id (getReviewsWithUserReview)", () => {
  it("should return 400 if type is invalid", async () => {
    const res = await request(app).get("/api/reviews/1?type=invalid");
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Type (song, album, artist) is required and must be valid.");
  });

  it("should return reviews and userReview", async () => {
    const mockReviews = [{ _id: "rev1" }, { _id: "rev2" }];
    const mockUserReview = { _id: "rev3" };

    Review.find.mockReturnValue({ populate: jest.fn().mockResolvedValue(mockReviews) });
    Review.findOne.mockReturnValue({ populate: jest.fn().mockResolvedValue(mockUserReview) });

    const res = await request(app).get("/api/reviews/1?type=Album");
    expect(res.status).toBe(200);
    expect(res.body.reviews).toEqual(mockReviews);
    expect(res.body.userReview).toEqual(mockUserReview);
  });
});

// Edit test group
describe("PUT /api/reviews/:id (editReview)", () => {
    it("should return 404 if review not found", async () => {
      Review.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(null),
      });
  
      const res = await request(app).put("/api/reviews/123").send({});
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Review not found");
    });
  
    it("should return 403 if user is not the owner", async () => {
      const mockReview = {
        user: { _id: { toString: () => "otheruser" } },
        save: jest.fn(),
      };
  
      Review.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockReview),
      });
  
      const res = await request(app).put("/api/reviews/123").send({});
      expect(res.status).toBe(403);
      expect(res.body.message).toBe("Unauthorized to edit this review");
    });
  
    it("should update and return the review", async () => {
      const mockSave = jest.fn();
      const mockReview = {
        user: { _id: { toString: () => "user123" } },
        rating: 3,
        reviewText: "Old review",
        createdAt: new Date(),
        save: mockSave,
      };
  
      Review.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockReview),
      });
  
      const res = await request(app).put("/api/reviews/123").send({
        rating: 5,
        reviewText: "Updated",
      });
  
      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Review updated successfully");
    });
  });
  
// Delete test group
describe("DELETE /api/reviews/:id (deleteReview)", () => {
  it("should return 404 if review not found", async () => {
    Review.findById.mockResolvedValue(null);
    const res = await request(app).delete("/api/reviews/123");
    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Review not found");
  });

  it("should return 403 if user is not the owner", async () => {
    Review.findById.mockResolvedValue({ user: "otheruser" });
    const res = await request(app).delete("/api/reviews/123");
    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Unauthorized to delete this review");
  });

  it("should delete the review", async () => {
    const mockDelete = jest.fn();
    const mockReview = {
      user: "user123",
      deleteOne: mockDelete,
    };
    Review.findById.mockResolvedValue(mockReview);

    const res = await request(app).delete("/api/reviews/123");
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Review deleted successfully");
  });
});