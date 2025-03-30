export interface CreateReviewCommandModel {
  albumSongOrArtist: {
    id: number;
    type: "Album" | "Song" | "Artist";
    title?: string;  // Only for Albums & Songs
    name?: string;    // Artist name
    cover?: string; // Album/Song cover
    picture?: string; // Artist picture
    isExplicit?: boolean; // Song
    artist?: string;
  };
  rating: number;
  reviewText: string;
}
