import { Review } from "./review-responses";

export interface User {
  _id: string;
  username: string;
  email: string;
  profilePicture: string;
  friendInfo: FriendInfo;
  isFriend?: boolean;
  hasPendingRequestSent?: boolean;
  hasPendingRequestReceived?: boolean;
  reviews?: Review;
}

export interface FriendInfo {
  friends: User[];
  friendRequestsSent: User[];
  friendRequestsReceived: User[];
}