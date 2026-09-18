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
  // Only ever non-empty for a MusicBrainz-sourced upcoming row - see
  // backend/models/UpcomingRelease.js. Raw shape, not yet a full Song (no
  // id/preview/etc) - calendar-page.component.ts maps it when opening the
  // review page.
  tracklist?: { title: string; artist: string | null; durationMs: number | null }[];
  // True ONLY for a genuine pre-release stub with no real catalog entry yet
  // (Spotify/MusicBrainz-sourced UpcomingRelease row) - false/absent for
  // everything else, INCLUDING a same-day Deezer release shown under the
  // "upcoming" tab's date range (see getMusicCalendar's upcoming branch) -
  // that one has a real, fully-fetchable Deezer albumId. Use this, not
  // which tab an entry is displayed under, to decide whether to skip live
  // API calls when opening the review page.
  isPreRelease?: boolean;
}

export interface MusicCalendarResponse {
  success: boolean;
  data: MusicCalendarEntry[];
  hasMore: boolean;
  total: number;
  subtitle: CalendarSubtitle;
  monthGroups: CalendarMonthGroup[];
}
