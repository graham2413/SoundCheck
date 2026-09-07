import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core';
import { animate, animateChild, query, stagger, style, transition, trigger } from '@angular/animations';
import { CinemaService } from '../../services/cinema.service';
import {
  CinemaSeasonEpisode,
  EpisodeImdbRating,
  EpisodeImdbRatingsCacheStatus,
} from '../../models/responses/cinema-response';

// Display-only for now (per plan chunk 5) - no mark-watched/rate interaction
// yet, that's a deliberate follow-up once this is confirmed working.
// Episode metadata (TMDb) and IMDb ratings are fetched independently and
// merged client-side by season+episode number - the ratings endpoint
// returns the WHOLE show's episodes in one call (see imdbEpisodeMap.js),
// so switching seasons here never re-fetches ratings, only TMDb metadata.
type RatingsRequestState = 'loading' | 'processing' | 'loaded';

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
  @Input() showStatus: string | null = null; // TMDb's raw production status, e.g. "Ended", "Returning Series"

  // Fired once the season's episodes (and, separately, once ratings) finish
  // loading - the page's scrollable height only reaches its real size after
  // this, so the parent (cinema-review-page) uses it to re-run its "scroll
  // tabs row to top" logic, which the initial attempt (fired before any of
  // this content existed) couldn't fully complete.
  @Output() contentLoaded = new EventEmitter<void>();

  selectedSeason = 1;
  seasonDropdownOpen = false;

  episodes: CinemaSeasonEpisode[] = [];
  loadingEpisodes = false;

  // Reserved height for the loading placeholder, measured from the real
  // list right before it's replaced (see selectSeason) - a fixed guess
  // (e.g. "24rem") never matched a season's actual rendered height closely
  // enough, so the page still visibly collapsed then grew back.
  @ViewChild('episodesContainer') private episodesContainer?: ElementRef<HTMLElement>;
  listMinHeightPx: number | null = null;

  ratingsRequestState: RatingsRequestState = 'loading';
  private ratingsByKey = new Map<string, EpisodeImdbRating>();
  private pollHandle: ReturnType<typeof setTimeout> | null = null;
  // Bumped on every new fetch so a stale in-flight request (or its poll
  // chain) can never clobber state after a newer one has already resolved.
  private ratingsRequestToken = 0;
  private readonly POLL_INTERVAL_MS = 4000;

  constructor(private cinemaService: CinemaService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['tmdbId'] && this.tmdbId) {
      this.loadSeason(this.selectedSeason);
    }
    if (changes['imdbId'] && this.imdbId) {
      this.loadRatings();
    }
  }

  ngOnDestroy(): void {
    this.clearPoll();
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
    this.loadSeason(season);
  }

  private loadSeason(season: number): void {
    if (!this.tmdbId) return;
    this.loadingEpisodes = true;
    this.loadedImageEpisodes.clear(); // episode numbers restart at 1 each season - stale "loaded" state would skip the new season's spinners
    this.cinemaService.getTvSeasonEpisodes(this.tmdbId, season).subscribe({
      next: ({ data }) => {
        this.episodes = data.episodes;
        this.loadingEpisodes = false;
        this.listMinHeightPx = null; // let the container return to its natural height for the new content
        this.contentLoaded.emit();
      },
      error: () => {
        this.episodes = [];
        this.loadingEpisodes = false;
        this.listMinHeightPx = null;
        this.contentLoaded.emit();
      },
    });
  }

  private get mappedShowStatus(): 'ended' | 'ongoing' | undefined {
    if (this.showStatus === 'Ended' || this.showStatus === 'Canceled') return 'ended';
    return this.showStatus ? 'ongoing' : undefined;
  }

  private loadRatings(): void {
    if (!this.imdbId) return;
    this.clearPoll();
    this.ratingsRequestState = 'loading';
    const token = ++this.ratingsRequestToken;

    this.cinemaService.getEpisodeImdbRatings(this.imdbId, this.mappedShowStatus).subscribe({
      next: ({ data }) => this.handleRatingsResponse(token, data.cacheStatus, data.episodes),
      error: () => {
        if (token !== this.ratingsRequestToken) return;
        this.ratingsRequestState = 'loaded'; // treat a failed fetch the same as the "no data" fallback
      },
    });
  }

  private handleRatingsResponse(
    token: number,
    cacheStatus: EpisodeImdbRatingsCacheStatus,
    episodes: EpisodeImdbRating[] | undefined
  ): void {
    if (token !== this.ratingsRequestToken) return;

    if (cacheStatus === 'processing') {
      this.ratingsRequestState = 'processing';
      this.pollHandle = setTimeout(() => this.pollRatings(token), this.POLL_INTERVAL_MS);
      return;
    }

    this.ratingsByKey = new Map((episodes || []).map((e) => [`${e.seasonNumber}-${e.episodeNumber}`, e]));
    this.ratingsRequestState = 'loaded';
    this.contentLoaded.emit();
  }

  private pollRatings(token: number): void {
    if (token !== this.ratingsRequestToken || !this.imdbId) return;
    this.cinemaService.getEpisodeImdbRatings(this.imdbId, this.mappedShowStatus).subscribe({
      next: ({ data }) => this.handleRatingsResponse(token, data.cacheStatus, data.episodes),
      error: () => {
        if (token !== this.ratingsRequestToken) return;
        this.ratingsRequestState = 'loaded';
      },
    });
  }

  private clearPoll(): void {
    if (this.pollHandle) {
      clearTimeout(this.pollHandle);
      this.pollHandle = null;
    }
  }

  ratingFor(episodeNumber: number): EpisodeImdbRating | null {
    return this.ratingsByKey.get(`${this.selectedSeason}-${episodeNumber}`) ?? null;
  }

  get hasAnyRatingsData(): boolean {
    return this.ratingsByKey.size > 0;
  }

  formatAirDate(airDate: string | null): string | null {
    if (!airDate) return null;
    const date = new Date(airDate);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
