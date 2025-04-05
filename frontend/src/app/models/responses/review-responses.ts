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

export interface DisplayReview extends Review {
  albumSongOrArtist: {
    cover: string;
    title: string;
    type: string;
  };
}

export interface NewReviewResponse {
  message: string;
  review: Review;
}

export interface Reviews {
  reviews: Review[];
  userReview: Review;
}