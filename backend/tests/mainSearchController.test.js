const express = require('express');
const request = require('supertest');

// Mock callDeezer from utils
jest.mock('../utils/callDeezer', () => ({
  callDeezer: jest.fn(),
}));
const { callDeezer: mockCallDeezer } = require('../utils/callDeezer');

jest.mock('fs', () => ({
  readFileSync: jest.fn().mockReturnValue('fake-certificate'),
  existsSync: jest.fn().mockReturnValue(true), // ✅ this is what's missing
}));

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    zremrangebyscore: jest.fn(),
    zcard: jest.fn().mockResolvedValue(0),
    multi: jest.fn().mockReturnValue({
      zadd: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    }),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(null),
    tls: jest.fn().mockReturnValue({ ca: 'fake-certificate' }), // Mock tls config
  }));
});

const mainSearchController = require('../controllers/mainSearchController');

const app = express();
app.use(express.json());
app.get('/api/music/search', mainSearchController.searchMusic);
app.get('/api/music/track/:trackId', mainSearchController.getTrackDetails);
app.get('/api/music/album/:albumId', mainSearchController.getAlbumDetails);
app.get('/api/music/artist/:artistId', mainSearchController.getArtistTopTracks);

module.exports = { app, mockCallDeezer };

beforeEach(() => {
  jest.clearAllMocks();
});

// Track test group
describe('GET /api/music/track/:trackId', () => {
    it('should return 200 if Deezer returns no track data', async () => {
        mockCallDeezer.mockResolvedValueOnce({ data: null });
      
        const res = await request(app).get('/api/music/track/123');
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ message: "Track not found" });
      });
  
      it('should return 200 and track details', async () => {
        mockCallDeezer.mockResolvedValueOnce({
            data: {
              id: 123,
              preview: 'url.mp3',
              release_date: '2020-01-01',
              duration: 200,
              album: { title: 'Album' },
              contributors: [{ name: 'Artist' }],
            },
          });          
      
        const res = await request(app).get('/api/music/track/123');

        expect(res.status).toBe(200);
        expect(res.body.id).toBe(123); // Ensure the ID matches the data returned
        expect(res.body.albumTitle).toBe('Album');
        expect(res.body.contributors).toEqual(['Artist']);
    });
      
  });


// Album test group
describe('GET /api/music/album/:albumId', () => {
    it('should return 200 if album not found', async () => {
        mockCallDeezer.mockResolvedValueOnce({ data: null });
      
        const res = await request(app).get('/api/music/album/456');
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ message: "Album not found" });
      });
      
  
    it('should return 200 and album details', async () => {
      // Simulate callDeezer returning album data
      mockCallDeezer.mockResolvedValueOnce({
        data: {
          id: 456,
          release_date: '2022-02-02',
          tracks: {
            data: [
              { id: 1, title: 'Song 1', duration: 180 },
              { id: 2, title: 'Song 2', duration: 200 },
            ],
          },
        },
      });
  
      const res = await request(app).get('/api/music/album/456');
      expect(res.status).toBe(200); // Expect 200 status
      expect(res.body.tracklist.length).toBe(2); // Ensure two tracks are returned
    });
  });

// Artist test group
describe('GET /api/music/artist/:artistId', () => {
    it('should return 200 if artist not found or no tracks', async () => {
        mockCallDeezer.mockResolvedValueOnce({ data: null });
      
        const res = await request(app).get('/api/music/artist/789');
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ message: "Artist not found or no tracks available" });
    });
      
  
      it('should return 200 and artist top tracks', async () => {
        mockCallDeezer.mockResolvedValueOnce({
          data: {
            data: [
              { id: 1, title: 'Top 1', duration: 180, explicit_lyrics: false },
              { id: 2, title: 'Top 2', duration: 200, explicit_lyrics: true },
            ],
          },
        });
      
        const res = await request(app).get('/api/music/artist/789');
        expect(res.status).toBe(200);
        expect(res.body.length).toBe(2); // Ensure 2 tracks are returned
      }); 
  });

  // Search test group
  describe('GET /api/music/search', () => {
    it('should return 400 if query is missing', async () => {
      const res = await request(app).get('/api/music/search');
  
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: 'Query is required' });
    });
  
    it('should return 200 with songs, albums, and artists arrays', async () => {
      mockCallDeezer
        .mockResolvedValueOnce({ data: { data: [{ id: 1, title: 'Song', album: { id: 10, title: 'A', cover: '', genre_id: 1 }, artist: { name: 'X' }, preview: '', explicit_lyrics: false }] } }) // songs
        .mockResolvedValueOnce({ data: { data: [{ id: 20, title: 'Album', artist: { name: 'Y' }, cover: '' }] } }) // albums
        .mockResolvedValueOnce({ data: { data: [{ id: 30, name: 'Artist', picture: '', tracklist: '' }] } }) // artists
        .mockResolvedValueOnce({ data: { genres: { data: [{ name: 'Pop' }]}}}) // genre lookup for album 10
        .mockResolvedValueOnce({ data: { genres: { data: [{ name: 'Rock' }]}}}); // genre lookup for album 20

        const res = await request(app).get('/api/music/search?query=test&type=all');
  
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('songs');
      expect(res.body).toHaveProperty('albums');
      expect(res.body).toHaveProperty('artists');
      expect(Array.isArray(res.body.songs)).toBe(true);
      expect(Array.isArray(res.body.albums)).toBe(true);
      expect(Array.isArray(res.body.artists)).toBe(true);
    });
  
    it('should return 200 and fallback to empty arrays if one or more Deezer calls fail', async () => {
      mockCallDeezer
        .mockRejectedValueOnce(new Error('Deezer songs failed')) // songs
        .mockResolvedValueOnce({ data: { data: [] } }) // albums
        .mockRejectedValueOnce(new Error('Deezer artists failed')); // artists
  
        const res = await request(app).get('/api/music/search?query=fallback&type=all');
  
      expect(res.status).toBe(200);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('songs');
      expect(res.body).toHaveProperty('albums');
      expect(res.body).toHaveProperty('artists');
      expect(Array.isArray(res.body.songs)).toBe(true);
      expect(Array.isArray(res.body.albums)).toBe(true);
      expect(Array.isArray(res.body.artists)).toBe(true);
    });
  });
  