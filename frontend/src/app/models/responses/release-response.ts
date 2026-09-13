import { CalendarSubtitle, CalendarMonthGroup } from './cinema-response';

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

// GET /api/search/music-calendar - the music equivalent of CalendarEntry,
// same response shape as the cinema calendar (data/hasMore/total/subtitle/
// monthGroups). Past entries come from the locally-synced Deezer catalog;
// upcoming entries come from Spotify instead (see backend
// utils/callSpotify.js for why) - `albumId` isn't reliably the same ID
// namespace between the two ranges (Deezer album id vs Spotify album id).
export interface MusicCalendarEntry {
  _id: string;
  albumId: string;
  artistId: string;
  artistName: string;
  title: string;
  cover: string | null;
  airDate: string;
  isExplicit: boolean;
  // Deezer's/Spotify's own classification ("album" | "single" | "ep" |
  // "compile"/"compilation") - null for past rows synced before this field
  // existed, or if the provider didn't supply one.
  recordType: string | null;
}

export interface MusicCalendarResponse {
  success: boolean;
  data: MusicCalendarEntry[];
  hasMore: boolean;
  total: number;
  subtitle: CalendarSubtitle;
  monthGroups: CalendarMonthGroup[];
}
