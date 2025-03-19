export interface CreateReviewCommandModel {
  albumSongOrArtist: {
    id: number;
    type: "Album" | "Song" | "Artist";
    title?: string;  // Only for Albums & Songs
    name: string;    // Artist name
    coverImage?: string; // Album/Song cover
    profilePicture?: string; // Artist picture
  };
  rating: number;
  reviewText: string;
}
