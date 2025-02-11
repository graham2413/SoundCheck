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
}

export interface CreatedReviewResponse {
  message: string;
  review: Review;
}

export interface Reviews {
  reviews: Review[];
  userReview: Review;
}