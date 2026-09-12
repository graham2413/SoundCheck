import { Component, ElementRef, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { animate, animateChild, query, stagger, style, transition, trigger } from '@angular/animations';
import { CommonModule } from '@angular/common';
import { SpotifyService } from 'src/app/services/spotify.service';
import { CinemaService } from 'src/app/services/cinema.service';
import { AlbumImage } from '../../../models/responses/album-images-response';
import { CinemaSearchResult } from '../../../models/responses/cinema-response';
import { getCinemaStatusBadge, CinemaBadgeVm } from '../../../shared/cinema-status-badge';
import { CinemaBadgeComponent } from '../../../shared/cinema-badge/cinema-badge.component';
import {
  CinemaWatchlistFilterComponent,
  CinemaWatchlistFilterState,
} from '../../cinema-watchlist-filter/cinema-watchlist-filter.component';

// Default filter state for this page's Sort & Filter overlay - "Trending
// Rank" (the order the trending endpoint already returns) instead of the
// watchlist's "Date Added" default, since these items were never added to
// anything. Fields the overlay hides in 'trending' mode (status, mediaType,
// provider, hasRatingOnly, groupByReleaseStatus) stay at inert defaults.
const DEFAULT_TRENDING_FILTERS: CinemaWatchlistFilterState = {
  status: 'all',
  mediaType: 'all',
  releaseStatus: 'all',
  genre: '',
  provider: '',
  sortBy: 'trendingRank',
  sortOrder: 'desc',
  hasReleaseDateOnly: false,
  hasRatingOnly: false,
  groupByReleaseStatus: false,
};

// Same idea, reused for the music grid's Sort & Filter overlay - genre and
// sort are the only fields that apply (no release-status/provider/rating
// concept for a trending album), so releaseStatus/provider/etc just stay
// at their inert 'all'/'' defaults and the overlay hides those sections.
const DEFAULT_MUSIC_TRENDING_FILTERS: CinemaWatchlistFilterState = { ...DEFAULT_TRENDING_FILTERS };

export type SeeAllTrendingKind = 'music' | 'cinema';

// Full-screen "See All" grid, opened from the "Trending Right Now" row's
// "See All" button. Music shows every stored trending album (already only
// ~110, no pagination needed); cinema reuses the same trending endpoint as
// the marquee, with its own Movies/Shows toggle mirroring the marquee's.
@Component({
  selector: 'app-see-all-trending',
  standalone: true,
  imports: [CommonModule, CinemaBadgeComponent, CinemaWatchlistFilterComponent],
  templateUrl: './see-all-trending.component.html',
  styleUrls: ['./see-all-trending.component.css'],
  animations: [
    // Same fade/slide-in pattern as the calendar page, watchlist, and main
    // search results.
    trigger('fadeSlideIn', [
      transition(':enter', [
        query('@itemAnim', [stagger(50, animateChild())], { optional: true }),
      ]),
    ]),
    trigger('itemAnim', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-16px)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0)' })),
      ]),
    ]),
  ],
})
export class SeeAllTrendingComponent implements OnInit, OnChanges {
  @Input() kind: SeeAllTrendingKind = 'music';
  @Input() initialCinemaMode: 'movie' | 'tv' = 'movie';

  @ViewChild('scrollBody') scrollBody?: ElementRef<HTMLElement>;

  @Output() back = new EventEmitter<void>();
  @Output() musicCardClick = new EventEmitter<{ album: AlbumImage; list: AlbumImage[]; index: number }>();
  @Output() cinemaCardClick = new EventEmitter<{ item: CinemaSearchResult; list: CinemaSearchResult[]; index: number }>();

  isLoading = true;
  albums: AlbumImage[] = [];
  cinemaItems: CinemaSearchResult[] = [];
  cinemaMode: 'movie' | 'tv' = 'movie';
  albumImageLoaded: boolean[] = [];
  cinemaImageLoaded: boolean[] = [];

  readonly defaultTrendingFilters = DEFAULT_TRENDING_FILTERS;
  readonly defaultMusicFilters = DEFAULT_MUSIC_TRENDING_FILTERS;
  showFilterOverlay = false;
  trendingFilters: CinemaWatchlistFilterState = { ...DEFAULT_TRENDING_FILTERS };
  musicFilters: CinemaWatchlistFilterState = { ...DEFAULT_MUSIC_TRENDING_FILTERS };

  constructor(
    private spotifyService: SpotifyService,
    private cinemaService: CinemaService
  ) {}

  ngOnInit(): void {
    this.cinemaMode = this.initialCinemaMode;
    this.loadData();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['kind'] && !changes['kind'].firstChange) {
      this.loadData();
    }
  }

  setCinemaMode(mode: 'movie' | 'tv'): void {
    if (this.cinemaMode === mode) return;
    this.cinemaMode = mode;
    this.trendingFilters = { ...DEFAULT_TRENDING_FILTERS };
    this.scrollBody?.nativeElement.scrollTo({ top: 0 });
    this.loadData();
  }

  private loadData(): void {
    this.isLoading = true;
    if (this.kind === 'music') {
      this.spotifyService.getAlbumImages().subscribe({
        next: ({ albums }) => {
          this.albums = albums || [];
          this.albumImageLoaded = [];
          this.isLoading = false;
        },
        error: () => {
          this.albums = [];
          this.isLoading = false;
        },
      });
    } else {
      this.cinemaService.getTrendingCinema(this.cinemaMode).subscribe({
        next: ({ data }) => {
          this.cinemaItems = data || [];
          this.cinemaImageLoaded = [];
          this.isLoading = false;
        },
        error: () => {
          this.cinemaItems = [];
          this.isLoading = false;
        },
      });
    }
  }

  onMusicCardClick(index: number): void {
    const list = this.filteredAlbums;
    this.musicCardClick.emit({ album: list[index], list, index });
  }

  // Same rationale as trendingRank() below - the ribbon shows the album's
  // original trending position, unaffected by the user's filter/sort.
  musicTrendingRank(album: AlbumImage): number {
    return this.albums.indexOf(album) + 1;
  }

  get availableMusicGenres(): string[] {
    const genres = new Set<string>();
    this.albums.forEach((album) => {
      if (album.genre) genres.add(album.genre);
    });
    return Array.from(genres).sort();
  }

  get filteredAlbums(): AlbumImage[] {
    const f = this.musicFilters;
    let items = this.albums;

    if (f.genre) {
      items = items.filter((album) => album.genre === f.genre);
    }
    if (f.hasReleaseDateOnly) {
      items = items.filter((album) => !!album.releaseDate);
    }

    if (f.sortBy === 'title') {
      items = [...items].sort((a, b) => a.title.localeCompare(b.title));
      if (f.sortOrder === 'desc') items.reverse();
    } else if (f.sortBy === 'releaseDate') {
      items = [...items].sort((a, b) => (a.releaseDate || '').localeCompare(b.releaseDate || ''));
      if (f.sortOrder === 'desc') items.reverse();
    }
    // 'trendingRank' - leave in the endpoint's original order.

    return items;
  }

  // Single set of bindings for the one <app-cinema-watchlist-filter> in the
  // template, routed to whichever list (cinema or music) is currently shown.
  get filterOverlayFilters(): CinemaWatchlistFilterState {
    return this.kind === 'cinema' ? this.trendingFilters : this.musicFilters;
  }

  get filterOverlayDefaults(): CinemaWatchlistFilterState {
    return this.kind === 'cinema' ? this.defaultTrendingFilters : this.defaultMusicFilters;
  }

  get filterOverlayGenres(): string[] {
    return this.kind === 'cinema' ? this.availableGenres : this.availableMusicGenres;
  }

  // Same upscale the marquee applies (see marquee.component.ts) - stored
  // Deezer cover URLs default to a small size unless a bigger one is requested.
  highQualityCover(imageUrl: string): string {
    if (!imageUrl) return '';
    if (imageUrl.includes('api.deezer.com')) return `${imageUrl}?size=xl`;
    return imageUrl;
  }

  // The rank ribbon always reflects the item's position in the original
  // trending order, not its position after the user's filter/sort - the
  // sort only reorders which items are shown, not what "trending rank"
  // they actually earned.
  trendingRank(item: CinemaSearchResult): number {
    return this.cinemaItems.indexOf(item) + 1;
  }

  onCinemaCardClick(index: number): void {
    const list = this.filteredCinemaItems;
    this.cinemaCardClick.emit({ item: list[index], list, index });
  }

  // All trending items are already loaded up front (no pagination on this
  // page), so filtering/sorting happens client-side rather than round-
  // tripping to the server like the watchlist's query-param filters do.
  get availableGenres(): string[] {
    const genres = new Set<string>();
    this.cinemaItems.forEach((item) => (item.genres ?? []).forEach((g) => genres.add(g)));
    return Array.from(genres).sort();
  }

  get filteredCinemaItems(): CinemaSearchResult[] {
    const f = this.trendingFilters;
    let items = this.cinemaItems;

    if (f.genre) {
      items = items.filter((item) => (item.genres ?? []).includes(f.genre));
    }
    if (f.hasReleaseDateOnly) {
      items = items.filter((item) => !!item.releaseDate);
    }
    const releaseStatus = f.releaseStatus;
    if (releaseStatus !== 'all') {
      items = items.filter((item) => this.matchesReleaseStatus(item, releaseStatus));
    }

    if (f.sortBy === 'title') {
      items = [...items].sort((a, b) => a.title.localeCompare(b.title));
      if (f.sortOrder === 'desc') items.reverse();
    } else if (f.sortBy === 'releaseDate') {
      items = [...items].sort((a, b) => (a.releaseDate || '').localeCompare(b.releaseDate || ''));
      if (f.sortOrder === 'desc') items.reverse();
    }
    // 'trendingRank' - leave in the endpoint's original order.

    return items;
  }

  // Reuses the same badge classification already computed for the card's
  // status ribbon, so "In Theaters"/"Coming Soon"/etc mean the same thing
  // here as what the user sees on screen. "Available" is the absence of any
  // of those badges (an ordinary already-out title).
  private matchesReleaseStatus(
    item: CinemaSearchResult,
    releaseStatus: Exclude<CinemaWatchlistFilterState['releaseStatus'], 'all'>
  ): boolean {
    const kind = this.cinemaBadge(item)?.kind ?? null;
    switch (releaseStatus) {
      case 'in_theaters':
        return kind === 'in-theaters';
      case 'coming_soon':
        return kind === 'coming-soon';
      case 'new_episodes':
        return kind === 'new-episode';
      case 'back_in_theaters':
        return kind === 'back-in-theaters';
      case 'available':
        return kind === null;
    }
  }

  openFilterOverlay(): void {
    this.showFilterOverlay = true;
  }

  onApplyFilters(filters: CinemaWatchlistFilterState): void {
    if (this.kind === 'cinema') {
      this.trendingFilters = filters;
    } else {
      this.musicFilters = filters;
    }
    this.showFilterOverlay = false;
  }

  releaseMonthYear(item: CinemaSearchResult): string {
    if (item.mediaType === 'tv' && item.releaseYearRange) return item.releaseYearRange;
    if (!item.releaseDate) return 'TBA';
    return this.parseLocalDate(item.releaseDate).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  // Avoids UTC midnight shifting the date back a day in negative-offset
  // timezones (matches cinema-review-page.component.ts/tv-episode-badge.ts).
  private parseLocalDate(dateStr: string): Date {
    const [year, month, day] = dateStr.slice(0, 10).split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  // Same badge logic/priority/icons/labels as everywhere else (see shared/cinema-status-badge.ts).
  cinemaBadge(item: CinemaSearchResult): CinemaBadgeVm | null {
    return getCinemaStatusBadge(item);
  }
}
