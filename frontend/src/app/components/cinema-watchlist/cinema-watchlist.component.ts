import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { InfiniteScrollDirective } from 'ngx-infinite-scroll';
import { CinemaItem } from 'src/app/models/responses/cinema-response';
import { TimeAgoPipe } from 'src/app/shared/timeAgo/time-ago.pipe';
import { getTvEpisodeBadge, tvEpisodeBadgeLabel as getTvEpisodeBadgeLabel, TvEpisodeBadge } from 'src/app/shared/tv-episode-badge';
import { getMovieRereleaseBadge, movieRereleaseBadgeLabel as getMovieRereleaseBadgeLabel, MovieRereleaseBadge } from 'src/app/shared/movie-rerelease-badge';
import { getMovieReleaseBadge, movieReleaseBadgeLabel as getMovieReleaseBadgeLabel, MovieReleaseBadge } from 'src/app/shared/movie-release-badge';

// Exclusive theatrical windows don't last forever - without this bound, an
// old catalog title that never got streamingPlatforms/digitalReleaseDate
// backfilled (missing data, not actually still in theaters) would be
// misclassified as "in theaters" indefinitely. Mirrors the same bound used
// server-side (getWatchlist's releaseStatus=in_theaters) and in the shared
// movie-release-badge helper.
const IN_THEATERS_WINDOW_DAYS = 90;

// Presentational watchlist list (mirrors the calendar page's row layout) -
// purely renders/paginates whatever list it's given. All data-fetching and
// cross-list syncing (e.g. rating an item also affects the separate reviews
// list) stays owned by the parent for now; this only owns row rendering and
// per-row image-load state.
@Component({
  selector: 'app-cinema-watchlist',
  standalone: true,
  imports: [CommonModule, InfiniteScrollDirective, TimeAgoPipe],
  templateUrl: './cinema-watchlist.component.html',
  styleUrl: './cinema-watchlist.component.css',
})
export class CinemaWatchlistComponent {
  @Input() items: CinemaItem[] = [];
  @Input() isLoading = false;
  @Input() isFetchingMore = false;
  @Input() scrollContainer: HTMLElement | null = null;
  @Input() groupByReleaseStatus = false;

  @Output() itemClicked = new EventEmitter<{ item: CinemaItem; list: CinemaItem[]; index: number }>();
  @Output() loadMore = new EventEmitter<void>();

  private imageLoaded: { [index: number]: boolean } = {};

  onItemClick(item: CinemaItem, index: number): void {
    this.itemClicked.emit({ item, list: this.items, index });
  }

  // Pre-existing items were added before watchlistAddedAt existed - fall
  // back to createdAt as a best-effort approximation for those.
  watchlistAddedDate(item: CinemaItem): string | undefined {
    return item.watchlistAddedAt || item.createdAt;
  }

  // Only meaningful when groupByReleaseStatus is on - buckets whatever's
  // currently loaded into sections, preserving relative order within each.
  // Purely a client-side visual grouping of the already-fetched page(s), not
  // a separate paginated query. "In Theaters" only applies to movies that
  // actually had a US theatrical run (hadTheatricalRelease) - a streaming/
  // VOD-only movie without a platform yet doesn't count as "in theaters",
  // it's just unclassified here (still shows up under the flat/ungrouped view).
  get comingSoonItems(): CinemaItem[] {
    return this.items.filter((item) => this.isComingSoon(item.releaseDate));
  }

  // Per-movie digital-release date (if TMDb has one on record) tells us it's
  // left its exclusive theatrical window even before a streaming platform we
  // track has picked it up - more accurate than a fixed day-count guess.
  private hasDigitalReleaseArrived(item: CinemaItem): boolean {
    if (!item.digitalReleaseDate) return false;
    const todayStr = new Date().toISOString().slice(0, 10);
    return item.digitalReleaseDate.slice(0, 10) <= todayStr;
  }

  get inTheatersItems(): CinemaItem[] {
    return this.items.filter(
      (item) =>
        !this.isComingSoon(item.releaseDate) &&
        item.mediaType === 'movie' &&
        item.hadTheatricalRelease &&
        !item.streamingPlatforms?.length &&
        !this.hasDigitalReleaseArrived(item) &&
        this.daysSinceRelease(item.releaseDate) <= IN_THEATERS_WINDOW_DAYS
    );
  }

  get availableNowItems(): CinemaItem[] {
    return this.items.filter((item) => {
      if (this.isComingSoon(item.releaseDate)) return false;
      if (item.mediaType === 'movie') {
        if (item.streamingPlatforms?.length || this.hasDigitalReleaseArrived(item)) return true;
        // Aged out of the in-theaters window with no streaming/digital data
        // on record - assume it's available by now rather than leaving it
        // out of every group.
        return item.hadTheatricalRelease && this.daysSinceRelease(item.releaseDate) > IN_THEATERS_WINDOW_DAYS;
      }
      return true;
    });
  }

  private daysSinceRelease(releaseDate?: string): number {
    if (!releaseDate) return Infinity;
    return (Date.now() - new Date(releaseDate).getTime()) / (1000 * 60 * 60 * 24);
  }

  indexOfItem(item: CinemaItem): number {
    return this.items.indexOf(item);
  }

  // Simple date-string compare (no live TMDb call needed) - releaseDate is
  // already stored/returned for every item, so this is free.
  isComingSoon(releaseDate?: string): boolean {
    if (!releaseDate) return false;
    const todayStr = new Date().toISOString().slice(0, 10);
    return releaseDate.slice(0, 10) > todayStr;
  }

  // TV only - "New Episode" (aired recently) / "New Season Soon" (season
  // premiere airs soon) / "Airing Soon" (regular next episode airs soon)
  // badge, independent of the movie-only "Coming Soon" release badge.
  tvEpisodeBadge(item: CinemaItem): TvEpisodeBadge {
    if (item.mediaType !== 'tv') return null;
    return getTvEpisodeBadge(item.lastEpisodeAirDate, item.nextEpisodeAirDate, item.nextEpisodeNumber);
  }

  // Movie only - a later theatrical reissue on record (e.g. an anniversary
  // re-release), independent of the "Coming Soon" badge for the original release.
  movieRereleaseBadge(item: CinemaItem): MovieRereleaseBadge {
    if (item.mediaType !== 'movie') return null;
    return getMovieRereleaseBadge(item.rereleaseDate);
  }

  movieRereleaseBadgeLabel(badge: MovieRereleaseBadge): string {
    return getMovieRereleaseBadgeLabel(badge);
  }

  // Movie only - "In Theaters"/"New Release" for the ORIGINAL release, takes
  // priority over the rerelease badge above (mutually exclusive in practice -
  // a movie can't be a new release and have a reissue already).
  movieReleaseBadge(item: CinemaItem): MovieReleaseBadge {
    if (item.mediaType !== 'movie') return null;
    return getMovieReleaseBadge({
      releaseDate: item.releaseDate,
      hadTheatricalRelease: item.hadTheatricalRelease,
      hasStreamingAvailability: !!item.streamingPlatforms?.length,
      digitalReleaseDate: item.digitalReleaseDate,
    });
  }

  movieReleaseBadgeLabel(badge: MovieReleaseBadge): string {
    return getMovieReleaseBadgeLabel(badge);
  }

  tvEpisodeBadgeLabel(badge: TvEpisodeBadge): string {
    return getTvEpisodeBadgeLabel(badge);
  }

  markImageLoaded(i: number): void {
    this.imageLoaded[i] = true;
  }

  isImageLoaded(i: number): boolean {
    return this.imageLoaded[i] === true;
  }

  // Small poster-sized thumbnail instead of the full-res cover, for the watchlist list.
  // Returns null (no image element rendered) when there's no cover, instead of
  // falling back to the shared music-themed placeholder image, which looked
  // wrong for movies/shows - see the icon-based placeholder in the template.
  getThumbUrl(cover: string | undefined | null): string | null {
    if (!cover) return null;
    return cover.includes('/upload/')
      ? cover.replace('/upload/', '/upload/w_300,h_450,c_fill,f_auto,q_auto/')
      : cover;
  }
}
