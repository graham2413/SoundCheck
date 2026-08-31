import { Review } from "./review-responses";
import { Song } from "./song-response";
import { CinemaItem } from "./cinema-response";

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
  reviews?: Review[];
  friends?: User[];
  createdAt: string;
  artistList?: FollowedArtist[];
  gradient: string;
  cinemaWatchlistIsPublic?: boolean;
  cinemaReviews?: CinemaItem[];
}

export interface FriendInfo {
  friends: User[];
  friendRequestsSent: User[];
  friendRequestsReceived: User[];
}

export interface FollowedArtist {
  id: string;
  name: string;
  picture?: string;
  tracklist?: Song[];
  preview?: string;
  addedAt?: Date;
}