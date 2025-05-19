export interface AlbumImage {
  _id: string;
  id: number;
  type: 'Album';
  title: string;
  artist: string;
  cover: string;
  genre: string;
  isExplicit: boolean;
  preview: string;
  releaseDate: string;
  tracklist: {
    id: number;
    title: string;
    duration: number;
    preview: string;
    isExplicit: boolean;
  }[];
  createdAt: string;
  updatedAt: string;
  __v?: number;
}

export interface AlbumImagesResponse {
  albums: AlbumImage[];
}