// Shared "In Theaters"/"New Release" movie badge logic - describes a movie's
// CURRENT release-window status (distinct from the "Coming Soon" upcoming
// badge and the movie-rerelease-badge's "Back in Theaters"/"Returning to
// Theaters", which is about a later reissue, not the original release).
// "In Theaters" takes priority over "New Release" - a movie that's both
// (still has an exclusive theatrical window AND was released recently)
// should only show "In Theaters"; a Netflix/streaming-exclusive movie with
// no theatrical run just shows "New Release".
const IN_THEATERS_WINDOW_DAYS = 90;
const NEW_RELEASE_WINDOW_DAYS = 30;

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
}

export type MovieReleaseBadge = 'in-theaters' | 'new-release' | null;

export interface MovieReleaseBadgeInput {
  releaseDate?: string | null;
  hadTheatricalRelease?: boolean;
  hasStreamingAvailability?: boolean; // streamingPlatforms.length > 0, or watchProviders.length > 0
  digitalReleaseDate?: string | null;
}

export function getMovieReleaseBadge(item: MovieReleaseBadgeInput): MovieReleaseBadge {
  if (!item.releaseDate) return null;
  const releaseDate = parseLocalDate(item.releaseDate);
  const now = new Date();
  if (releaseDate > now) return null; // upcoming - handled by the separate "Coming Soon" badge

  const daysSinceRelease = (now.getTime() - releaseDate.getTime()) / (1000 * 60 * 60 * 24);
  const digitalArrived = !!item.digitalReleaseDate && parseLocalDate(item.digitalReleaseDate) <= now;

  const isInTheaters =
    !!item.hadTheatricalRelease &&
    !item.hasStreamingAvailability &&
    !digitalArrived &&
    daysSinceRelease <= IN_THEATERS_WINDOW_DAYS;

  if (isInTheaters) return 'in-theaters';
  if (daysSinceRelease <= NEW_RELEASE_WINDOW_DAYS) return 'new-release';
  return null;
}

export function movieReleaseBadgeLabel(badge: MovieReleaseBadge): string {
  switch (badge) {
    case 'in-theaters':
      return 'In Theaters';
    case 'new-release':
      return 'New Release';
    default:
      return '';
  }
}
