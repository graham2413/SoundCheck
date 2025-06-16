import { Song } from "./song-response";

export interface BaseRecord {
  id: number;
  type: 'Album' | 'Song' | 'Artist';
  title?: string;
  name?: string;
  artist?: string;
  cover?: string;
  picture?: string;
  album?: string;
  genre?: string;
  isExplicit?: boolean;
  preview?: string;
  releaseDate?: string;
  tracklist?: Song[];
  contributors?: string[];
  duration?: number;
  isPlaying?: boolean;
  wasOriginallyAlbumButTreatedAsSingle?: boolean;
}