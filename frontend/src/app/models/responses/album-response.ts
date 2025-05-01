import { Song } from "./song-response";

export interface Album {
    id: number;
    title: string;
    artist: string;
    cover: string;
    releaseDate: string;
    tracklist: Song[];
    genre: string;
    type: 'Album';
    isExplicit: boolean;
    preview: string;
  }
