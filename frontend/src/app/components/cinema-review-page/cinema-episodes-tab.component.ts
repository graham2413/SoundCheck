import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core';
import { animate, animateChild, query, stagger, style, transition, trigger } from '@angular/animations';
import { CinemaService } from '../../services/cinema.service';
import {
  CinemaSeasonEpisode,
  EpisodeImdbRating,
} from '../../models/responses/cinema-response';

// Display-only for now (per plan chunk 5) - no mark-watched/rate interaction
// yet, that's a deliberate follow-up once this is confirmed working.
// Episode metadata (TMDb) and IMDb ratings are fetched independently and
// merged client-side by season+episode number - the ratings endpoint is
// scoped to one season at a time (see episodeRatingLookup.js), so switching
// seasons re-fetches ratings just like it re-fetches TMDb metadata. Results
// for every season visited (or prefetched) stay cached in ratingsByKey for
// the life of this component, so revisiting a season never re-fetches.
type RatingsRequestState = 'loading' | 'loaded';

@Component({
  selector: 'app-cinema-episodes-tab',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cinema-episodes-tab.component.html',
  styleUrls: ['./cinema-episodes-tab.component.css'],
  // Same staggered slide-in used on other results pages (e.g. main-search's
  // result lists) - re-plays whenever the episode list re-enters (initial
  // load, and every season switch, since that's wrapped in an *ngIf below).
  animations: [
    trigger('fadeSlideIn', [
      transition(':enter', [
        query('@itemAnim', [stagger(50, animateChild())], { optional: true }),
      ]),
    ]),
    trigger('itemAnim', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(-20px)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateX(0)' })),
      ]),
    ]),
  ],
})
export class CinemaEpisodesTabComponent implements OnChanges, OnDestroy {
  @Input() tmdbId: string | null = null;
  @Input() imdbId: string | null = null;
  @Input() numberOfSeasons: number | null = null;

  // Fired right when a season switch is initiated (not tied to data load) -
  // lets the parent re-arm its scroll-to-top so switching seasons scrolls
  // back up the same way opening the Episodes tab does, instead of leaving
  // the user scrolled wherever they were on the previous season's list.
  @Output() seasonChanging = new EventEmitter<void>();

  // Fired once, the first time this show's episodes ever finish loading.
  // On first open, the page isn't tall enough yet for the parent's immediate
  // scroll-to-top to reach the tabs row's full target position - there's no
  // episode content rendered yet to scroll past. This lets the parent do one
  // catch-up scroll once the page has actually grown to its real height.
  @Output() firstEpisodesLoaded = new EventEmitter<void>();
  private hasEmittedFirstEpisodesLoaded = false;

  // Fired when an episode card is tapped - the parent (cinema-review-page ->
  // cinema-review-modal) opens the dedicated episode detail overlay with
  // this payload, no navigation involved.
  @Output() episodeSelected = new EventEmitter<{
    episode: CinemaSeasonEpisode;
    seasonNumber: number;
    seasonPosterUrl: string | null;
    imdbRating: EpisodeImdbRating | null;
  }>();

  selectedSeason = 1;
  seasonDropdownOpen = false;

  episodes: CinemaSeasonEpisode[] = [];
  loadingEpisodes = false;
  seasonPosterUrl: string | null = null;

  // Reserved height for the loading placeholder, measured from the real
  // list right before it's replaced (see selectSeason) - a fixed guess
  // (e.g. "24rem") never matched a season's actual rendered height closely
  // enough, so the page still visibly collapsed then grew back.
  @ViewChild('episodesContainer') private episodesContainer?: ElementRef<HTMLElement>;
  listMinHeightPx: number | null = null;

  ratingsRequestState: RatingsRequestState = 'loading';
  // The initial 'loading' state covers a round-trip that's almost always
  // near-instant (per-episode TMDb lookups are individually cached) -
  // showing a spinner immediately for that made every season switch look
  // like it was "reloading ratings" even on a cache hit. Only render the
  // per-episode spinners if the round-trip is still pending after a short
  // delay, i.e. a genuinely slow/uncached fetch.
  showRatingsLoadingIndicators = false;
  private ratingsLoadingDelayHandle: ReturnType<typeof setTimeout> | null = null;
  private static readonly RATINGS_LOADING_DELAY_MS = 400;
  // Accumulates across every season visited (or prefetched) this component's
  // lifetime - switching back to an already-fetched season is instant.
  private ratingsByKey = new Map<string, EpisodeImdbRating>();
  // Dedupes concurrent fetches for the same season (a direct season switch
  // landing on a season that's already being prefetched shares that same
  // in-flight request instead of firing a second one).
  private seasonRatingsFetch = new Map<number, Promise<void>>();
  // Bumped on every new season switch so a stale in-flight request can never
  // clobber state after a newer one has already resolved.
  private ratingsRequestToken = 0;

  constructor(private cinemaService: CinemaService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['tmdbId'] && this.tmdbId) {
      this.loadSeason(this.selectedSeason);
    }
    if (changes['imdbId'] && this.imdbId) {
      this.loadRatings(this.selectedSeason);
    }
  }

  ngOnDestroy(): void {
    if (this.ratingsLoadingDelayHandle) clearTimeout(this.ratingsLoadingDelayHandle);
  }

  get seasonOptions(): number[] {
    const count = this.numberOfSeasons || 0;
    return Array.from({ length: count }, (_, i) => i + 1);
  }

  toggleSeasonDropdown(): void {
    this.seasonDropdownOpen = !this.seasonDropdownOpen;
  }

  private loadedImageEpisodes = new Set<number>();

  isImageLoaded(episodeNumber: number): boolean {
    return this.loadedImageEpisodes.has(episodeNumber);
  }

  markImageLoaded(episodeNumber: number): void {
    this.loadedImageEpisodes.add(episodeNumber);
  }

  selectSeason(season: number): void {
    this.seasonDropdownOpen = false;
    if (season === this.selectedSeason) return;
    // Capture the currently-rendered list's real height before it's
    // replaced by the loading placeholder, so the placeholder can reserve
    // that exact amount of space instead of a rough fixed guess.
    const currentHeight = this.episodesContainer?.nativeElement.offsetHeight;
    if (currentHeight) this.listMinHeightPx = currentHeight;
    this.selectedSeason = season;
    this.seasonChanging.emit();
    this.loadSeason(season);
    this.loadRatings(season);
  }

  private loadSeason(season: number): void {
    if (!this.tmdbId) return;
    this.loadingEpisodes = true;
    this.loadedImageEpisodes.clear(); // episode numbers restart at 1 each season - stale "loaded" state would skip the new season's spinners
    this.cinemaService.getTvSeasonEpisodes(this.tmdbId, season).subscribe({
      next: ({ data }) => {
        this.episodes = data.episodes;
        this.seasonPosterUrl = data.posterUrl;
        this.loadingEpisodes = false;
        this.listMinHeightPx = null; // let the container return to its natural height for the new content
        this.emitFirstEpisodesLoadedOnce();
      },
      error: () => {
        this.episodes = [];
        this.loadingEpisodes = false;
        this.listMinHeightPx = null;
        this.emitFirstEpisodesLoadedOnce();
      },
    });
  }

  private emitFirstEpisodesLoadedOnce(): void {
    if (this.hasEmittedFirstEpisodesLoaded) return;
    this.hasEmittedFirstEpisodesLoaded = true;
    this.firstEpisodesLoaded.emit();
  }

  // Visible load for the season the user is actually looking at - shows the
  // loading-card affordance (after the usual short delay) unless this season
  // was already fetched (directly or via prefetch), then prefetches the next
  // season in the background so switching forward feels instant.
  private loadRatings(season: number): void {
    if (!this.imdbId) return;
    if (this.ratingsLoadingDelayHandle) clearTimeout(this.ratingsLoadingDelayHandle);

    const alreadySettled = this.settledSeasons.has(season);
    this.ratingsRequestState = alreadySettled ? 'loaded' : 'loading';
    this.showRatingsLoadingIndicators = false;
    if (!alreadySettled) {
      this.ratingsLoadingDelayHandle = setTimeout(() => {
        if (this.ratingsRequestState === 'loading') this.showRatingsLoadingIndicators = true;
      }, CinemaEpisodesTabComponent.RATINGS_LOADING_DELAY_MS);
    }
    const token = ++this.ratingsRequestToken;

    this.fetchSeasonRatings(season).then(() => {
      if (token !== this.ratingsRequestToken) return;
      this.clearRatingsLoadingDelay();
      this.ratingsRequestState = 'loaded';
      this.prefetchNextSeason(season);
    });
  }

  // Every season a fetch has resolved for (success or failure) - lets a
  // revisit skip the loading-card affordance instead of re-showing it for a
  // season that's already in ratingsByKey (or genuinely has no ratings).
  private settledSeasons = new Set<number>();

  // Fetches (and caches) one season's ratings, deduping concurrent callers -
  // a direct season switch that lands on an already-prefetching season
  // shares that same in-flight request instead of firing a second one.
  private fetchSeasonRatings(season: number): Promise<void> {
    const existing = this.seasonRatingsFetch.get(season);
    if (existing) return existing;

    const fetchPromise = new Promise<void>((resolve) => {
      this.cinemaService.getEpisodeImdbRatings(this.imdbId!, season).subscribe({
        next: ({ data }) => {
          for (const episode of data.episodes) {
            this.ratingsByKey.set(`${episode.seasonNumber}-${episode.episodeNumber}`, episode);
          }
          this.settledSeasons.add(season);
          resolve();
        },
        error: () => {
          this.settledSeasons.add(season); // treat a failed fetch the same as the "no data" fallback
          resolve();
        },
      });
    });

    this.seasonRatingsFetch.set(season, fetchPromise);
    return fetchPromise;
  }

  // Fire-and-forget - never awaited, never bumps ratingsRequestToken (a
  // prefetch completing after the user has already switched seasons again
  // should still populate the cache, just not touch the currently-displayed
  // loading state).
  private prefetchNextSeason(season: number): void {
    const nextSeason = season + 1;
    if (nextSeason > (this.numberOfSeasons || 0)) return;
    if (this.seasonRatingsFetch.has(nextSeason)) return;
    this.fetchSeasonRatings(nextSeason);
  }

  private clearRatingsLoadingDelay(): void {
    if (this.ratingsLoadingDelayHandle) {
      clearTimeout(this.ratingsLoadingDelayHandle);
      this.ratingsLoadingDelayHandle = null;
    }
    this.showRatingsLoadingIndicators = false;
  }

  ratingFor(episodeNumber: number): EpisodeImdbRating | null {
    return this.ratingsByKey.get(`${this.selectedSeason}-${episodeNumber}`) ?? null;
  }

  selectEpisode(episode: CinemaSeasonEpisode): void {
    this.episodeSelected.emit({
      episode,
      seasonNumber: this.selectedSeason,
      seasonPosterUrl: this.seasonPosterUrl,
      imdbRating: this.ratingFor(episode.episodeNumber),
    });
  }

  // Whether the CURRENTLY SELECTED season has any ratings - not global,
  // since ratingsByKey now accumulates every season ever fetched (including
  // prefetched ones the user hasn't looked at), so a global check would hide
  // the "unavailable" card for a ratings-less season just because some other
  // season happened to have data.
  get hasAnyRatingsData(): boolean {
    const prefix = `${this.selectedSeason}-`;
    for (const key of this.ratingsByKey.keys()) {
      if (key.startsWith(prefix)) return true;
    }
    return false;
  }

  formatAirDate(airDate: string | null): string | null {
    if (!airDate) return null;
    const date = this.parseLocalDate(airDate);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // Avoids UTC midnight shifting the date back a day in negative-offset
  // timezones (matches cinema-review-page.component.ts/tv-episode-badge.ts).
  private parseLocalDate(dateStr: string): Date {
    const [year, month, day] = dateStr.slice(0, 10).split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  // Same "1h 15m"/"45m" format used elsewhere in the app (cinema-review-page,
  // cinema-awards-page's runtimeLabel getters).
  formatRuntime(minutes: number | null): string | null {
    if (!minutes) return null;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours && mins) return `${hours}h ${mins}m`;
    if (hours) return `${hours}h`;
    return `${mins}m`;
  }
}
