export interface CreateReviewCommandModel {
  albumSongOrArtist: {
    id: number;
    type: "Album" | "Song" | "Artist";
    wasOriginallyAlbumButTreatedAsSingle: boolean; // For records from artist feed or marquee (Retrieved as albums but are actually singles)
    title?: string;  // Only for Albums & Songs
    name?: string;    // Artist name
    cover?: string; // Album/Song cover
    picture?: string; // Artist picture
    isExplicit?: boolean; // Song
    artist?: string;
    album?: string;
    genre?: string; // Album/Song
  };
  rating: number;
  reviewText: string;
}
