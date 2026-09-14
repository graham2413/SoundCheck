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
    contributors?: string[];
    // Used for the smart-link feature's exact Spotify match - see
    // backend/controllers/mainSearchController.js's getSmartLink.
    upc?: string | null;
  }
