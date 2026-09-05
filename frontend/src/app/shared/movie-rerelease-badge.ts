// Shared "Back in Theaters"/"Returning to Theaters" movie badge logic - for
// titles with a later theatrical reissue on record (e.g. an anniversary
// re-release), independent of the "Coming Soon" badge (which is about the
// original release). Mirrors tv-episode-badge.ts's windowed approach.
const RETURNING_SOON_WINDOW_DAYS = 45;
const BACK_IN_THEATERS_WINDOW_DAYS = 45;

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
}

export type MovieRereleaseBadge = 'returning-soon' | 'back-in-theaters' | null;

export function getMovieRereleaseBadge(rereleaseDate?: string | null): MovieRereleaseBadge {
  if (!rereleaseDate) return null;
  const daysUntil = (parseLocalDate(rereleaseDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);

  if (daysUntil >= 0 && daysUntil <= RETURNING_SOON_WINDOW_DAYS) {
    return 'returning-soon';
  }
  if (daysUntil < 0 && daysUntil >= -BACK_IN_THEATERS_WINDOW_DAYS) {
    return 'back-in-theaters';
  }
  return null;
}

export function movieRereleaseBadgeLabel(badge: MovieRereleaseBadge): string {
  switch (badge) {
    case 'returning-soon':
      return 'Returning to Theaters';
    case 'back-in-theaters':
      return 'Back in Theaters';
    default:
      return '';
  }
}
