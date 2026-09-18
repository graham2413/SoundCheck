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
    // Deezer/Spotify/MusicBrainz's own record_type/album_type/primary-type
    // ("album"/"single"/"ep"/"compilation", always lowercased at the source -
    // see backend/utils/callMusicBrainz.js) - only populated for upcoming
    // releases today (see review-page.component.ts's musicTypeLabel), since
    // that's the only place genre isn't available as a substitute.
    recordType?: string | null;
    // Set only by calendar-page.component.ts's openMusicEntry, for a release
    // that hasn't come out yet (sourced from UpcomingRelease, not Deezer) -
    // review-page.component.ts uses this to skip Deezer/smart-link/player
    // API calls that can never succeed for something that doesn't exist in
    // any real catalog yet.
    isUpcoming?: boolean;
  }
