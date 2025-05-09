export interface Review {
  _id: string;
  user: {
    _id: string;
    username: string;
    profilePicture: string;
  };
  albumSongOrArtist: {
    id: string;
    type: 'Album' | 'Song' | 'Artist';
    title?: string;
    name?: string;
    cover?: string;
    picture?: string;
    isExplicit?: boolean;
    artist?: string;
    album?: string;
    genre?: string;
  };
  rating: number;
  reviewText: string;
  createdAt: string;
}

export interface NewReviewResponse {
  message: string;
  review: Review;
}

export interface Reviews {
  reviews: Review[];
  userReview: Review;
}