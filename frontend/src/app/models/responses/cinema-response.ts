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
  isWatchlist: boolean;
  isUnrefinedImport: boolean;
  traktSynced: boolean;
  seasons?: Season[];
  completionPercentage?: number; // TV only, computed virtual
  createdAt: string;
}

export interface ImdbStats {
  imdbId: string;
  imdbRating: string | null;
  voteCount: string | null;
}

export interface ImdbStatsResponse {
  success: boolean;
  data: ImdbStats;
}
