import { Album } from "./album-response";
import { Artist } from "./artist-response";
import { Song } from "./song-response";

  export interface SearchResponse {
    albums: Album[];
    artists: Artist[];
    songs: Song[];
  }
  