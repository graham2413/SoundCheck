import { Song } from "./song-response";

export type ActivityRecord = {
  id: string;
  type: 'Song' | 'Album' | 'Artist';
  title?: string;
  name?: string;
  artist?: string;
  cover?: string;
  picture?: string;
  album?: string;
  genre?: string;
  isExplicit?: boolean;

  // Optional enrichment for compatibility
  preview?: string;
  releaseDate?: string;
  tracklist?: Song[];
  isPlaying?: boolean;
  contributors?: string[];
  duration?: number;
};