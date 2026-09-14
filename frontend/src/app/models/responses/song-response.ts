export interface Song {
    id: number;
    title: string;
    artist: string;
    album: string;
    cover: string;
    preview: string;
    isExplicit: boolean;
    genre: string;
    releaseDate: string;
    contributors: string[];
    duration: number;
    type: 'Song';
    isPlaying: boolean;
    wasOriginallyAlbumButTreatedAsSingle?: boolean;
    // Used for the smart-link feature's exact Spotify match - see
    // backend/controllers/mainSearchController.js's getSmartLink.
    isrc?: string | null;
  }
