import { getMovieReleaseBadge, movieReleaseBadgeLabel, MovieReleaseBadgeInput } from './movie-release-badge';
import { getMovieRereleaseBadge, movieRereleaseBadgeLabel } from './movie-rerelease-badge';
import { getTvEpisodeBadge, tvEpisodeBadgeLabel } from './tv-episode-badge';
import { getCinemaBadgeIcon, CinemaBadgeKind } from './badge-icon';

export interface CinemaBadgeVm {
  kind: CinemaBadgeKind;
  label: string;
  icon: string;
}

export interface CinemaStatusBadgeInput extends MovieReleaseBadgeInput {
  mediaType: 'movie' | 'tv';
  lastEpisodeAirDate?: string | null;
  nextEpisodeAirDate?: string | null;
  nextEpisodeNumber?: number | null;
  rereleaseDate?: string | null;
}

function isComingSoon(releaseDate?: string | null): boolean {
  if (!releaseDate) return false;
  const todayStr = new Date().toISOString().slice(0, 10);
  return releaseDate.slice(0, 10) > todayStr;
}

// Local-date parse (matches movie/tv-badge helpers) - avoids UTC midnight
// shifting the date back a day in negative-offset timezones.
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
}

// TV only - the series itself (not just a single episode) premiered
// recently. Movies use the smarter movie-release-badge.ts instead (which
// accounts for theatrical windows); a TV series has no such window, so this
// is a simpler "days since first air date" check.
const SERIES_NEW_RELEASE_WINDOW_DAYS = 30;
function isNewSeries(releaseDate?: string | null): boolean {
  if (!releaseDate || isComingSoon(releaseDate)) return false;
  const daysSinceRelease = (Date.now() - parseLocalDate(releaseDate).getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceRelease <= SERIES_NEW_RELEASE_WINDOW_DAYS;
}

// Single source of truth for the status badge (In Theaters/New Release/
// Coming Soon/New Episode/etc) shown on cinema cards everywhere - marquee,
// See All, search results, watchlist, and the person-detail filmography.
// Same priority order used everywhere: movies - In Theaters > New Release >
// rerelease (Back in Theaters/Returning to Theaters) > Coming Soon; TV -
// New Episode > New Season Soon > Airing Soon > New Series > Coming Soon.
// Fields the caller doesn't have (e.g. the person-detail filmography only
// has releaseDate) just fall through to null/Coming Soon gracefully.
export function getCinemaStatusBadge(item: CinemaStatusBadgeInput): CinemaBadgeVm | null {
  if (item.mediaType === 'tv') {
    const episodeBadge = getTvEpisodeBadge(item.lastEpisodeAirDate, item.nextEpisodeAirDate, item.nextEpisodeNumber);
    if (episodeBadge) {
      return { kind: episodeBadge, label: tvEpisodeBadgeLabel(episodeBadge), icon: getCinemaBadgeIcon(episodeBadge) };
    }
    if (isNewSeries(item.releaseDate)) {
      return { kind: 'new-release', label: 'New Series', icon: getCinemaBadgeIcon('new-release') };
    }
    if (isComingSoon(item.releaseDate)) {
      return { kind: 'coming-soon', label: 'Coming Soon', icon: getCinemaBadgeIcon('coming-soon') };
    }
    return null;
  }

  const releaseBadge = getMovieReleaseBadge(item);
  if (releaseBadge) {
    return { kind: releaseBadge, label: movieReleaseBadgeLabel(releaseBadge), icon: getCinemaBadgeIcon(releaseBadge) };
  }
  const rereleaseBadge = getMovieRereleaseBadge(item.rereleaseDate);
  if (rereleaseBadge) {
    return { kind: rereleaseBadge, label: movieRereleaseBadgeLabel(rereleaseBadge), icon: getCinemaBadgeIcon(rereleaseBadge) };
  }
  if (isComingSoon(item.releaseDate)) {
    return { kind: 'coming-soon', label: 'Coming Soon', icon: getCinemaBadgeIcon('coming-soon') };
  }
  return null;
}
