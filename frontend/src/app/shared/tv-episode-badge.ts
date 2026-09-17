// Shared "New Episode"/"New Season Soon"/"Airing Soon" TV badge logic - used
// by the watchlist rows, main search results, and the cinema item detail
// page so the three surfaces stay in sync. "Airing Soon" only ever fires
// when "New Episode" doesn't apply (priority order below), so in practice it
// only shows for a show resuming after a >30-day gap with a regular
// (non-premiere) episode - not during normal active weekly airing.
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

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export type TvEpisodeBadgeKind = 'new-episode' | 'new-season' | 'airing-soon';
export interface TvEpisodeBadgeResult {
  kind: TvEpisodeBadgeKind;
  // Only meaningful for the two forward-looking kinds - true the entire
  // calendar day the episode airs, so the label can say "...Today" instead
  // of the anticipatory "...Soon" once it's actually happening.
  isToday: boolean;
}
export type TvEpisodeBadge = TvEpisodeBadgeResult | null;

// One badge at a time - "New Episode" (recently aired) takes priority over
// the two forward-looking badges since it's a concrete signal. Between the
// two forward-looking badges, a season premiere (episode 1) gets its own
// distinct "New Season Soon"/"New Season Today" label instead of the
// generic "Airing Soon"/"Airing Today".
export function getTvEpisodeBadge(
  lastEpisodeAirDate?: string | null,
  nextEpisodeAirDate?: string | null,
  nextEpisodeNumber?: number | null
): TvEpisodeBadge {
  // Both sides of every comparison below are start-of-local-day instants
  // (never a raw Date.now(), which includes the current time-of-day) so a
  // day counts as "day 0" for its entire 24 hours, not just its first
  // instant. Comparing a midnight-aligned target date against a bare
  // Date.now() meant daysUntilAirs went negative the moment any time at all
  // had elapsed past midnight on the air date itself - so on the exact day
  // a season premiered, the forward-looking badge below had already
  // stopped applying while lastEpisodeAirDate (which depends on upstream
  // TMDb/cache data catching up) hadn't started applying yet, leaving a
  // same-day window with no badge at all.
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (lastEpisodeAirDate) {
    const daysSinceAired = (today.getTime() - parseLocalDate(lastEpisodeAirDate).getTime()) / MS_PER_DAY;
    if (daysSinceAired >= 0 && daysSinceAired <= NEW_RELEASE_WINDOW_DAYS) {
      return { kind: 'new-episode', isToday: false };
    }
  }

  if (nextEpisodeAirDate) {
    const daysUntilAirs = (parseLocalDate(nextEpisodeAirDate).getTime() - today.getTime()) / MS_PER_DAY;
    const isPremiere = nextEpisodeNumber === 1;
    const window = isPremiere ? UPCOMING_SEASON_WINDOW_DAYS : UPCOMING_EPISODE_WINDOW_DAYS;
    if (daysUntilAirs >= 0 && daysUntilAirs <= window) {
      return { kind: isPremiere ? 'new-season' : 'airing-soon', isToday: daysUntilAirs === 0 };
    }
  }

  return null;
}

export function tvEpisodeBadgeLabel(badge: TvEpisodeBadge): string {
  if (!badge) return '';
  switch (badge.kind) {
    case 'new-episode':
      return 'New Episode';
    case 'new-season':
      return badge.isToday ? 'New Season Today' : 'New Season Soon';
    case 'airing-soon':
      return badge.isToday ? 'Airing Today' : 'Airing Soon';
  }
}

