// Single source of truth for which FontAwesome icon each cinema status
// badge uses - shared across the marquee, "See All" grid, search results,
// watchlist, and the detail page so they all stay visually in sync.
export type CinemaBadgeKind =
  | 'in-theaters'
  | 'new-release'
  | 'new-episode'
  | 'new-season'
  | 'airing-soon'
  | 'returning-soon'
  | 'back-in-theaters'
  | 'coming-soon';

const BADGE_ICONS: Record<CinemaBadgeKind, string> = {
  'in-theaters': 'fa-ticket',
  'new-release': 'fa-star',
  'new-episode': 'fa-tv',
  'new-season': 'fa-calendar-plus',
  'airing-soon': 'fa-broadcast-tower',
  'returning-soon': 'fa-rotate-left',
  'back-in-theaters': 'fa-ticket-simple',
  'coming-soon': 'fa-clock',
};

export function getCinemaBadgeIcon(kind: CinemaBadgeKind | null | undefined): string {
  return kind ? BADGE_ICONS[kind] : '';
}
