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
  }
