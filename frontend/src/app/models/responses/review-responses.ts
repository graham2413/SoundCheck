import { Album } from "./album-response";
import { Artist } from "./artist-response";
import { Song } from "./song-response";
import { User } from "./user.response";

export interface Review {
  _id: string;
  user: User;
  albumOrSongId: string;
  createdAt: string;
  rating: number;
  reviewText: string;
  type: string;
  __v: number;
  albumSongOrArtist: Album | Artist | Song;
}

export interface NewReviewResponse {
  message: string;
  review: Review;
}

export interface Reviews {
  reviews: Review[];
  userReview: Review;
}