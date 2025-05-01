import { Song } from "./song-response";

export interface Artist {
    id: number;
    name: string;
    picture: string;
    tracklist: Song[];
    type: 'Artist';
    preview: string;
  }
  