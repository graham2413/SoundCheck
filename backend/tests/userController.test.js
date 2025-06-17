jest.mock("../middleware/authMiddleware", () =>
    // directly return the function, not an object
    (req, res, next) => {
      req.user = { _id: "user123", id: "user123" };
      next();
    }
  );  
  
  const request = require("supertest");
  const express = require("express");
  const User = require("../models/User");
  const Review = require("../models/Review");
  const userRoutes = require("../routes/userRoutes");
  
  jest.mock("../models/User");
  jest.mock("../models/Review");
  
  const app = express();
  app.use(express.json());
  app.use("/api/users", userRoutes);
  
  beforeEach(() => {
    jest.clearAllMocks();
  });  

// Get user profile test group
describe("GET /api/users/:id", () => {
    it("should return 404 if user not found", async () => {
      const mockSelect = { populate: jest.fn().mockResolvedValue(null) };
      User.findById.mockReturnValue({ select: () => mockSelect });
  
      const res = await request(app).get("/api/users/999");
      expect(res.status).toBe(404);
    });
  
    it("should return user with reviews", async () => {
        const mockUser = {
          _id: "user123",
          username: "test",
          profilePicture: "",
          friends: [],
          createdAt: "2024-01-01",
        };
    
        User.findById.mockReturnValue({
          select: jest.fn().mockReturnThis(),
          populate: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue(mockUser)
        });
    
      Review.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([])
      });
    
        const res = await request(app).get("/api/users/profile/user123");
    
        expect(res.status).toBe(200);
        expect(res.body.username).toBe("test");
      });
  });
  

// Get authenticated user profile test group
describe("GET /api/users/profile", () => {
    it("should return full user profile", async () => {
      const mockUser = {
        _id: "user123",
        username: "me",
        email: "me@example.com",
        profilePicture: "",
        createdAt: "2024-01-01",
        friends: [],
        friendRequestsSent: [],
        friendRequestsReceived: [],
      };
  
      User.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockUser)
      });
  
      const res = await request(app).get("/api/users/profile");
  
      expect(res.status).toBe(200);
      expect(res.body.username).toBe("me");
    });
  });
  
// Update user profile test group
describe("PUT /api/users/profile", () => {
  it("should return 404 if user not found", async () => {
    User.findById.mockResolvedValue(null);
    const res = await request(app).put("/api/users/profile").send({});
    expect(res.status).toBe(404);
  });

  it("should update and return the user", async () => {
    const save = jest.fn().mockResolvedValue({
      _id: "user123",
      username: "new",
      email: "user@example.com",
      profilePicture: "pic.png",
      createdAt: "2024-01-01",
    });
    User.findById.mockResolvedValue({
      username: "old",
      profilePicture: "",
      save,
    });
    const res = await request(app).put("/api/users/profile").send({ username: "new" });
    expect(res.status).toBe(200);
    expect(res.body.username).toBe("new");
  });
});

// Send friend request test group
describe("POST /api/users/friends/send/:toUserId", () => {
  it("should prevent sending to self", async () => {
    const res = await request(app).post("/api/users/friends/send/user123");
    expect(res.status).toBe(400);
  });

  it("should send a request successfully", async () => {
    const save = jest.fn().mockResolvedValue({});
    User.findById.mockImplementation((id) =>
      Promise.resolve({
        _id: id,
        friends: [],
        friendRequestsSent: [],
        friendRequestsReceived: [],
        save,
      })
    );
    const res = await request(app).post("/api/users/friends/send/user456");
    expect(res.status).toBe(200);
  });
});

// Accept friend request test group
describe("POST /api/users/friends/accept/:fromUserId", () => {
  it("should accept a request successfully", async () => {
    const save = jest.fn().mockResolvedValue({});
    User.findById.mockImplementation((id) =>
      Promise.resolve({
        _id: id,
        friends: [],
        friendRequestsReceived: ["user456"],
        friendRequestsSent: ["user123"],
        save,
      })
    );
    const res = await request(app).post("/api/users/friends/accept/user456");
    expect(res.status).toBe(200);
  });
});

// Decline friend request test group
describe("POST /api/users/friends/decline/:fromUserId", () => {
    it("should decline a request successfully", async () => {
      const saveMock = jest.fn().mockResolvedValue();
  
      const receiverMock = {
        _id: "user123",
        friendRequestsReceived: ["user456"],
        friends: [],
        friendRequestsSent: [],
        save: saveMock,
      };
  
      const senderMock = {
        _id: "user456",
        friendRequestsSent: [
          {
            equals: (input) => input === "user123",
          },
        ],
        friends: [],
        friendRequestsReceived: [],
        save: saveMock,
      };
  
      let call = 0;
      User.findById.mockImplementation(() => {
        return Promise.resolve(call++ === 0 ? receiverMock : senderMock);
      });
  
      const res = await request(app).post("/api/users/friends/decline/user456");
  
      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Friend request declined.");
    });
  });
  

// Unfriend user test group
describe("POST /api/users/friends/unfriend/:friendId", () => {
    it("should unfriend a user", async () => {
      const save = jest.fn().mockResolvedValue({});
  
      const mockUser = {
        _id: "user123",
        friends: ["user456"],
        friendRequestsSent: [
          { equals: (input) => input === "user456" }
        ],
        friendRequestsReceived: [
          { equals: (input) => input === "user456" }
        ],
        save,
      };
  
      const mockFriend = {
        _id: "user456",
        friends: [
          { equals: (input) => input === "user123" }
        ],
        friendRequestsSent: [
          { equals: (input) => input === "user123" }
        ],
        friendRequestsReceived: [
          { equals: (input) => input === "user123" }
        ],
        save,
      };
  
      let call = 0;
      User.findById.mockImplementation(() => Promise.resolve(call++ === 0 ? mockUser : mockFriend));
  
      const res = await request(app).post("/api/users/friends/unfriend/user456");
  
      expect(res.status).toBe(200);
      expect(res.body.message).toBe("User unfriended successfully.");
    });
  });
  
// Search users test group
describe("GET /api/users/friends/search", () => {
    it("should return 400 for missing query", async () => {
        const res = await request(app).get("/api/users/friends/search");
        expect(res.status).toBe(400);
    });
  
    it("should return search results", async () => {
      User.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([{ username: "match" }])
      });
  
      const res = await request(app).get("/api/users/friends/search?q=match");
      expect(res.status).toBe(200);
      expect(res.body).toEqual([{ username: "match" }]);
    });
  });  
  
// Delete user profile test group
describe("DELETE /api/users/profile", () => {
  it("should delete user and related data", async () => {
    User.findById.mockResolvedValue({ _id: "user123" });
    User.findByIdAndDelete.mockResolvedValue({});
    User.updateMany.mockResolvedValue({});
    Review.deleteMany.mockResolvedValue({});
    const res = await request(app).delete("/api/users/profile");
    expect(res.status).toBe(200);
  });
});
