export interface EpisodeReview {
  seasonNumber: number;
  episodeNumber: number;
  isWatched: boolean;
  decimalRating?: number;
  reviewText?: string;
  reviewedAt?: string;
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
  releaseYearRange?: string; // TV only, e.g. "2017-2025" or "2016-Present"
  hadTheatricalRelease?: boolean; // movie only - did it actually get a US theatrical run at all
  digitalReleaseDate?: string; // movie only - earliest known US digital release date, if any
  genres?: string[];
  streamingPlatforms?: string[];
  decimalRating?: number;
  reviewText?: string;
  likes?: number;
  likedBy?: string[];
  isWatchlist: boolean;
  watchlistAddedAt?: string;
  isWatched: boolean;
  isUnrefinedImport: boolean;
  traktSynced: boolean;
  episodeReviews?: EpisodeReview[]; // TV only, sparse - see backend model comment
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
  isWatched?: boolean;
  decimalRating?: number;
  reviewText?: string;
  isUnrefinedImport: boolean;
}

export interface ImdbStatsResponse {
  success: boolean;
  data: ImdbStats;
}

export interface CinemaCastMember {
  personId?: number;
  name: string;
  character: string;
  profilePath: string | null;
  order?: number;
  popularity?: number;
}

export interface CinemaWatchProvider {
  name: string;
  logoUrl: string | null;
}

// Consolidated payload from GET /api/cinema/detail/:mediaType/:tmdbId - powers
// the cinema-review-page component (TMDb metadata/credits/providers + OMDb ratings/awards).
export interface CinemaDetail {
  tmdbId: string;
  mediaType: 'movie' | 'tv';
  imdbId: string | null;
  title: string;
  cover: string | null;
  year: number | null;
  releaseYearRange: string | null;
  releaseDate: string | null;
  isRerelease: boolean;
  status: string | null;
  lastEpisodeAirDate: string | null;
  nextEpisodeAirDate: string | null;
  runtimeMinutes: number | null;
  certification: string | null;
  genres: string[];
  description: string | null;
  director: string | null;
  cast: CinemaCastMember[];
  awardsRaw: string | null;
  awardsSummary: string | null;
  boxOffice: string | null;
  imdbRating: number | null;
  imdbVoteCount: number | null;
  watchProviders: CinemaWatchProvider[];
}

export interface CinemaDetailResponse {
  success: boolean;
  data: CinemaDetail;
}

export interface CinemaPersonCredit {
  tmdbId: string;
  mediaType: 'movie' | 'tv';
  title: string;
  cover: string | null;
  releaseDate: string | null;
}

// Payload from GET /api/cinema/person/:personId - powers the cast list's
// tap-to-expand detail popup.
export interface CinemaPersonDetail {
  name: string;
  profilePath: string | null;
  biography: string | null;
  instagramUrl: string | null;
  twitterUrl: string | null;
  imdbUrl: string | null;
  acting: CinemaPersonCredit[];
  directed: CinemaPersonCredit[];
}

export interface CinemaPersonDetailResponse {
  success: boolean;
  data: CinemaPersonDetail;
}

export interface CinemaPopularActor {
  personId: number;
  name: string;
  profilePath: string | null;
  popularity: number;
  isEstimated: boolean;
  knownForTitle: string | null;
}
