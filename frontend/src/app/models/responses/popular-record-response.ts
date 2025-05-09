import { Song } from "./song-response";

export type PopularRecord = {
  id: number;
  type: 'Album' | 'Song' | 'Artist';
  title?: string;
  name?: string;
  artist?: string;
  cover?: string;
  picture?: string;
  genre?: string;
  album?: string;
  isExplicit?: boolean;
  avgRating: number;
  reviewCount: number;

  // These help match Song/Album shape
  preview?: string;
  releaseDate?: string;
  tracklist?: Song[]; // could narrow further if needed
  isPlaying?: boolean;
  contributors?: string[];
  duration?: number;
};
