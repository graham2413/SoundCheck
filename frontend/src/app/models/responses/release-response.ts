export interface Release {
  _id: string;
  albumId: string;
  artistId: string;
  artistName: string;
  title: string;
  cover: string;
  releaseDate: string;
  isExplicit: boolean;
  __v: number;
  createdAt: string;
  updatedAt: string;
}

export interface GetReleasesResponse {
  releases: Release[];
  nextCursor?: {
    cursorDate: string;
    cursorId: string;
  };
}
