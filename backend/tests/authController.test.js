const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const authController = require('../controllers/authController');

// Mock JWT + bcrypt
jest.mock('jsonwebtoken');
jest.mock('bcryptjs');

const app = express();
app.use(express.json());
app.post('/api/auth/register', authController.registerUser);
app.post('/api/auth/login', authController.loginUser);
app.post('/api/auth/logout', authController.logoutUser);
app.post('/api/auth/forgot-password', authController.forgotPassword);
app.post('/api/auth/reset-password', authController.resetPassword);

// Mock DB
jest.mock('../models/User');

jest.mock('resend', () => {
  return {
    Resend: jest.fn().mockImplementation(() => ({
      emails: {
        send: jest.fn()
      }
    }))
  };
});

beforeEach(() => {
  jest.clearAllMocks();
});

// Register test group

describe('POST /api/auth/register', () => {

  it('should return 400 if user already exists', async () => {
    User.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ email: 'test@example.com' })
    });

    const res = await request(app).post('/api/auth/register').send({
      username: 'test',
      email: 'test@example.com',
      password: '123456'
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('User already exists');
  });

  it('should create user and return token + user info', async () => {
    User.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null)
    });
    bcrypt.genSalt.mockResolvedValue('salt');
    bcrypt.hash.mockResolvedValue('hashedPassword');

    const mockUser = {
      _id: new mongoose.Types.ObjectId(),
      username: 'test',
      email: 'test@example.com',
      profilePicture: '',
      createdAt: new Date(),
      save: jest.fn().mockResolvedValue()
    };

    User.mockImplementation(() => mockUser);
    jwt.sign.mockReturnValue('fake-jwt-token');

    const res = await request(app).post('/api/auth/register').send({
      username: 'test',
      email: 'test@example.com',
      password: '123456'
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toBe('fake-jwt-token');
    expect(res.body.user.email).toBe('test@example.com');
    expect(mockUser.save).toHaveBeenCalled();
  });

  it('should return 500 on server error', async () => {
    User.findOne.mockReturnValue({
      lean: jest.fn().mockRejectedValue(new Error('DB Error'))
    });

    const res = await request(app).post('/api/auth/register').send({
      username: 'test',
      email: 'test@example.com',
      password: '123456'
    });

    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/Server Error/);
  });
});


// Login test group
describe('POST /api/auth/login', () => {

  

  it('should return 400 if user does not exist', async () => {

    User.findOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(null)
    });
  
    const res = await request(app).post('/api/auth/login').send({
      email: 'nonexistent@example.com',
      password: 'irrelevant'
    });
  
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid credentials');
  });  

  it('should return 400 if password is incorrect', async () => {
    User.findOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ password: 'hashedPassword' })
    });
    bcrypt.compare.mockResolvedValue(false);

    const res = await request(app).post('/api/auth/login').send({
      email: 'test@example.com',
      password: 'wrongpass'
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid credentials');
  });

  it('should return token and user info on successful login', async () => {
    const mockUser = {
      _id: new mongoose.Types.ObjectId(),
      username: 'test',
      email: 'test@example.com',
      password: 'hashedPassword',
      profilePicture: '',
      createdAt: new Date(),
      friends: [],
      friendRequestsSent: [],
      friendRequestsReceived: []
    };

    User.findOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(mockUser)
    });
    bcrypt.compare.mockResolvedValue(true);
    jwt.sign.mockReturnValue('fake-login-token');

    const res = await request(app).post('/api/auth/login').send({
      email: 'test@example.com',
      password: 'correctpass'
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toBe('fake-login-token');
    expect(res.body.user.email).toBe('test@example.com');
  });

  it('should return 500 on server error', async () => {
    User.findOne.mockImplementation(() => {
      throw new Error('DB error');
    });

    const res = await request(app).post('/api/auth/login').send({
      email: 'test@example.com',
      password: 'irrelevant'
    });

    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/Server Error/);
  });
});


// Logout test group
describe('POST /api/auth/logout', () => {
  it('should return logout success message', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body.message).toBe(
      'Logged out successfully (JWT-based, client should remove token)'
    );
  });
});

// Forgot password test group
describe('POST /api/auth/forgot-password', () => {

  it('should return 404 if user not found', async () => {
    User.findOne.mockResolvedValue(null);

    const res = await request(app).post('/api/auth/forgot-password').send({
      email: 'notfound@example.com'
    });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('No user found with that email.');
  });

  it('should return 400 if user has no password (Google login)', async () => {
    User.findOne.mockResolvedValue({ email: 'google@example.com', password: null });

    const res = await request(app).post('/api/auth/forgot-password').send({
      email: 'google@example.com'
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('This account uses Google sign-in only.');
  });

  it('should return 200 if reset email sent', async () => {
    const saveMock = jest.fn().mockResolvedValue();
    const mockUser = {
      username: 'test',
      email: 'test@example.com',
      password: 'somehash',
      save: saveMock
    };

    const Resend = require('resend').Resend;
    Resend.mockImplementation(() => ({
      emails: {
        send: jest.fn().mockResolvedValue({})
      }
    }));

    User.findOne.mockResolvedValue(mockUser);

    const res = await request(app).post('/api/auth/forgot-password').send({
      email: 'test@example.com'
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Password reset email sent.');
    expect(saveMock).toHaveBeenCalled();
  });

  it('should return 500 if resend fails', async () => {
    const mockUser = {
      username: 'test',
      email: 'test@example.com',
      password: 'somehash',
      save: jest.fn().mockResolvedValue()
    };

    const Resend = require('resend').Resend;
    Resend.mockImplementation(() => ({
      emails: {
        send: jest.fn().mockResolvedValue({ error: 'some failure' })
      }
    }));

    User.findOne.mockResolvedValue(mockUser);

    const res = await request(app).post('/api/auth/forgot-password').send({
      email: 'test@example.com'
    });

    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Email failed to send.');
  });
});

// Rest password test group
describe('POST /api/auth/reset-password', () => {

  it('should return 400 if token is invalid or expired', async () => {
    User.findOne.mockResolvedValue(null);

    const res = await request(app).post('/api/auth/reset-password').send({
      token: 'invalidtoken',
      newPassword: 'newpass123'
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid or expired token.');
  });

  it('should return 400 if new password matches current password', async () => {
    const mockUser = {
      password: 'hashedpass',
    };
    User.findOne.mockResolvedValue(mockUser);
    bcrypt.compare.mockResolvedValue(true); // same password

    const res = await request(app).post('/api/auth/reset-password').send({
      token: 'validtoken',
      newPassword: 'samepassword'
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('New password cannot be the same as the current password.');
  });

  it('should reset password and clear reset token', async () => {
    const saveMock = jest.fn().mockResolvedValue();
    const mockUser = {
      password: 'oldhash',
      resetPasswordToken: 'abc',
      resetPasswordExpires: Date.now() + 10000,
      save: saveMock
    };

    User.findOne.mockResolvedValue(mockUser);
    bcrypt.compare.mockResolvedValue(false); // new password
    bcrypt.hash.mockResolvedValue('newhashed');

    const res = await request(app).post('/api/auth/reset-password').send({
      token: 'abc',
      newPassword: 'newpass123'
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Password has been reset successfully.');
    expect(saveMock).toHaveBeenCalled();
  });

  it('should return 500 on server error', async () => {
    User.findOne.mockImplementation(() => {
      throw new Error('DB fail');
    });

    const res = await request(app).post('/api/auth/reset-password').send({
      token: 'anytoken',
      newPassword: 'something'
    });

    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/Server error/);
  });
});
