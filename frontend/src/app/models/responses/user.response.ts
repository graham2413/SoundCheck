import { Album } from "./album-response";
import { Artist } from "./artist-response";
import { Review } from "./review-responses";
import { Song } from "./song-response";

export interface User {
  _id: string;
  username: string;
  email: string;
  profilePicture: string;
  friendInfo: FriendInfo;
  isFriend?: boolean;
  hasPendingRequestSent?: boolean;
  hasPendingRequestReceived?: boolean;
  googleId: string;
  reviews: Review[];
  friends: User[];
  createdAt: string;
  list: ListItem[];
  gradient: string;
}

export interface FriendInfo {
  friends: User[];
  friendRequestsSent: User[];
  friendRequestsReceived: User[];
}

export interface ListItem {
  id: string; // Always stored as string
  type: 'Album' | 'Artist' | 'Song';
  title?: string;
  name?: string;
  artist?: string;
  cover?: string;
  picture?: string;
  album?: string;
  genre?: string;
  preview?: string;         // Song-only field
  duration?: number;        // Song-only field
  isExplicit?: boolean;     // Song-only field
  releaseDate?: string;     // Song/Album field
  contributors?: string[];  // Song-only field
  tracklist?: Song[];        // Album or Artist field
  addedAt?: Date;
}