export interface Episode {
  seasonNumber: number;
  episodeNumber: number;
  title?: string;
  duration?: number; // seconds
  airDate?: string;
  isWatched: boolean;
}

export interface Season {
  seasonNumber: number;
  title?: string;
  episodes: Episode[];
}

export interface CinemaItem {
  // Discriminant so `record.type` narrowing works consistently across the
  // shared review-page template (mirrors Album/Song/Artist's `type` field).
  type: 'Cinema';
  _id: string;
  user: string;
  mediaType: 'movie' | 'tv';
  canonicalId?: string;
  imdbId?: string;
  tmdbId?: string;
  title: string;
  cover?: string;
  duration?: number; // seconds (movie only)
  releaseDate?: string;
  genres?: string[];
  streamingPlatforms?: string[];
  decimalRating?: number;
  reviewText?: string;
  likes?: number;
  likedBy?: string[];
  isWatchlist: boolean;
  isUnrefinedImport: boolean;
  traktSynced: boolean;
  seasons?: Season[];
  completionPercentage?: number; // TV only, computed virtual
  createdAt: string;
}

// A raw TMDb search result (movie or TV show), not yet tracked as a CinemaItem
export interface CinemaSearchResult {
  tmdbId: string;
  mediaType: 'movie' | 'tv';
  title: string;
  cover: string | null;
  releaseDate: string | null;
  releaseYearRange?: string;
  genres?: string[];
}

// A CinemaItem as returned by getCinemaReviews, with `user` populated
// (mirrors music's Review.user shape).
export interface CinemaReview extends Omit<CinemaItem, 'user'> {
  user: {
    _id: string;
    username: string;
    profilePicture: string;
  };
}

export interface CinemaReviewsResponse {
  reviews: CinemaReview[];
  userReview: CinemaReview | null;
}

export interface ImdbStats {
  imdbId: string;
  imdbRating: string | null;
  voteCount: string | null;
}

// One row from GET /api/cinema/calendar - a TV show's next episode to air,
// or a watchlisted movie's upcoming release date.
export interface CalendarEntry {
  _id: string;
  tmdbId: string;
  mediaType: 'movie' | 'tv';
  title: string;
  cover: string | null;
  airDate: string;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeName?: string;
  isRerelease?: boolean;
  isWatchlist: boolean;
  decimalRating?: number;
  reviewText?: string;
  isUnrefinedImport: boolean;
}

export interface ImdbStatsResponse {
  success: boolean;
  data: ImdbStats;
}
