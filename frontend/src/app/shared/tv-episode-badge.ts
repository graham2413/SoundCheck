// Shared "New Episode"/"New Season Soon"/"Airing Soon" TV badge logic - used
// by the watchlist rows, main search results, and the cinema item detail
// page so the three surfaces stay in sync.
const NEW_RELEASE_WINDOW_DAYS = 30;
const UPCOMING_EPISODE_WINDOW_DAYS = 7;
// Season premieres get announced/anticipated further ahead than a regular
// next episode, so they get a wider forward-looking window.
const UPCOMING_SEASON_WINDOW_DAYS = 45;

// Local-date parse (matches cinema-review-page.component.ts) - avoids UTC
// midnight shifting the date back a day in negative-offset timezones.
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
}

export type TvEpisodeBadge = 'new-episode' | 'new-season' | 'airing-soon' | null;

// One badge at a time - "New Episode" (recently aired) takes priority over
// the two forward-looking badges since it's a concrete signal. Between the
// two forward-looking badges, a season premiere (episode 1) gets its own
// distinct "New Season Soon" label instead of the generic "Airing Soon".
export function getTvEpisodeBadge(
  lastEpisodeAirDate?: string | null,
  nextEpisodeAirDate?: string | null,
  nextEpisodeNumber?: number | null
): TvEpisodeBadge {
  if (lastEpisodeAirDate) {
    const daysSinceAired = (Date.now() - parseLocalDate(lastEpisodeAirDate).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceAired >= 0 && daysSinceAired <= NEW_RELEASE_WINDOW_DAYS) {
      return 'new-episode';
    }
  }

  if (nextEpisodeAirDate) {
    const daysUntilAirs = (parseLocalDate(nextEpisodeAirDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    const isPremiere = nextEpisodeNumber === 1;
    const window = isPremiere ? UPCOMING_SEASON_WINDOW_DAYS : UPCOMING_EPISODE_WINDOW_DAYS;
    if (daysUntilAirs >= 0 && daysUntilAirs <= window) {
      return isPremiere ? 'new-season' : 'airing-soon';
    }
  }

  return null;
}

export function tvEpisodeBadgeLabel(badge: TvEpisodeBadge): string {
  switch (badge) {
    case 'new-episode':
      return 'New Episode';
    case 'new-season':
      return 'New Season Soon';
    case 'airing-soon':
      return 'Airing Soon';
    default:
      return '';
  }
}

