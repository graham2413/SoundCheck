import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { CinemaService } from 'src/app/services/cinema.service';
import { CinemaSearchResult } from '../../../models/responses/cinema-response';
import { getMovieReleaseBadge, movieReleaseBadgeLabel as getMovieReleaseBadgeLabel } from '../../../shared/movie-release-badge';
import { getMovieRereleaseBadge } from '../../../shared/movie-rerelease-badge';
import { getTvEpisodeBadge, tvEpisodeBadgeLabel as getTvEpisodeBadgeLabel } from '../../../shared/tv-episode-badge';
import { getCinemaBadgeIcon } from '../../../shared/badge-icon';

// One badge per card, top-left of the poster - or none at all if nothing
// applies. Same priority everywhere else in the app: movies - In Theaters >
// New Release > rerelease (Back in Theaters/Returning to Theaters) > Coming
// Soon; TV - New Episode > New Season Soon > Airing Soon > Coming Soon.
export type MarqueeBadge =
  | { kind: 'coming-soon' }
  | { kind: 'in-theaters' | 'new-release' }
  | { kind: 'returning-soon' | 'back-in-theaters' }
  | { kind: 'new-episode' | 'new-season' | 'airing-soon' }
  | null;

// Cinema counterpart to app-marquee (same windowed-rotation + rAF scroll
// technique for smoothness - see marquee.component.ts for the detailed
// rationale comments), but sourced from GET /cinema/trending instead of the
// Spotify album job, and with taller 2:3 poster cards instead of square
// album art. `mode` is owned by the parent (main-search.component) so the
// Movies/Shows toggle next to "Trending Right Now" can switch it.
@Component({
  selector: 'app-cinema-marquee',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cinema-marquee.component.html',
  styleUrls: ['./cinema-marquee.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CinemaMarqueeComponent implements OnInit, OnChanges, OnDestroy {
  @Input() mode: 'movie' | 'tv' = 'movie';
  @Output() cardClick = new EventEmitter<{
    item: CinemaSearchResult;
    list: CinemaSearchResult[];
    index: number;
  }>();

  @ViewChild('marqueeTrack') marqueeTrack?: ElementRef<HTMLDivElement>;

  items: CinemaSearchResult[] = [];
  skeletonArray = Array(10);
  isMarqueeLoading = true;
  marqueeImageLoaded: boolean[] = [];

  private fullItemList: CinemaSearchResult[] = [];
  private windowStartIndex = 0;
  private readonly WINDOW_SIZE = 15;
  private marqueeAnimationFrameId: number | null = null;
  private marqueeLastFrameTime: number | null = null;
  private marqueeOffsetPx = 0;
  private readonly MARQUEE_SPEED_PX_PER_SEC = 40;
  private firstBatchLoadedCount = 0;
  private scrollStarted = false;
  private readonly FIRST_BATCH_LOAD_TIMEOUT_MS = 3000;
  private readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000; // matches the backend's 24h Redis cache

  constructor(
    private cinemaService: CinemaService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadForMode();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['mode'] && !changes['mode'].firstChange) {
      this.stopMarqueeScroll();
      this.loadForMode();
    }
  }

  ngOnDestroy(): void {
    this.stopMarqueeScroll();
  }

  onCardClick(item: CinemaSearchResult, index: number): void {
    this.cardClick.emit({ item, list: this.items, index });
  }

  trackByIndex(index: number): number {
    return index;
  }

  private cacheKey(): string {
    // v3: bumped so old cached blobs (from before rereleaseDate was added)
    // get treated as a miss and refetched, instead of silently missing the
    // rerelease badge.
    return `cinemaTrending:v3:${this.mode}`;
  }

  private async loadForMode(): Promise<void> {
    this.isMarqueeLoading = true;
    let baseItems: CinemaSearchResult[] = [];

    const stored = localStorage.getItem(this.cacheKey());
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Date.now() - (parsed.cachedAt || 0) < this.CACHE_TTL_MS) {
          baseItems = parsed.items || [];
        }
      } catch (e) {
        console.warn('Failed to parse cached cinemaTrending:', e);
      }
    }

    if (baseItems.length === 0) {
      baseItems = await this.fetchAndStoreTrending();
    }

    this.setMarqueeWindow(baseItems);
  }

  private fetchAndStoreTrending(): Promise<CinemaSearchResult[]> {
    return new Promise((resolve) => {
      this.cinemaService.getTrendingCinema(this.mode).subscribe({
        next: ({ data }) => {
          localStorage.setItem(this.cacheKey(), JSON.stringify({ items: data, cachedAt: Date.now() }));
          resolve(data);
        },
        error: (err) => {
          console.error('Failed to fetch trending cinema:', err);
          resolve([]);
        },
      });
    });
  }

  private setMarqueeWindow(fullItemList: CinemaSearchResult[]): void {
    this.fullItemList = fullItemList;
    this.windowStartIndex = 0;
    this.items = fullItemList.slice(0, this.WINDOW_SIZE);
    this.marqueeImageLoaded = new Array(this.items.length).fill(false);
    this.isMarqueeLoading = false;
    this.firstBatchLoadedCount = 0;
    this.scrollStarted = false;
    this.marqueeOffsetPx = 0;
    this.cdr.detectChanges();

    this.ngZone.runOutsideAngular(() => {
      setTimeout(() => this.startMarqueeScrollOnce(), this.FIRST_BATCH_LOAD_TIMEOUT_MS);
    });
  }

  onFirstBatchImageEvent(): void {
    this.firstBatchLoadedCount++;
    if (this.firstBatchLoadedCount >= this.WINDOW_SIZE) {
      this.startMarqueeScrollOnce();
    }
  }

  private startMarqueeScrollOnce(): void {
    if (this.scrollStarted) return;
    this.scrollStarted = true;
    this.ngZone.runOutsideAngular(() => this.startMarqueeScroll());
  }

  private rotateWindow(): void {
    if (this.fullItemList.length <= this.WINDOW_SIZE) return;

    this.windowStartIndex = (this.windowStartIndex + this.WINDOW_SIZE) % this.fullItemList.length;
    this.items = Array.from(
      { length: this.WINDOW_SIZE },
      (_, i) => this.fullItemList[(this.windowStartIndex + i) % this.fullItemList.length]
    );
    this.marqueeImageLoaded = new Array(this.items.length).fill(false);
    this.cdr.detectChanges();
  }

  private startMarqueeScroll(): void {
    if (this.marqueeAnimationFrameId !== null) return;
    this.marqueeLastFrameTime = null;

    const step = (timestamp: number) => {
      const track = this.marqueeTrack?.nativeElement;
      if (!track) {
        this.marqueeAnimationFrameId = requestAnimationFrame(step);
        return;
      }

      if (this.marqueeLastFrameTime !== null) {
        const deltaSeconds = (timestamp - this.marqueeLastFrameTime) / 1000;
        this.marqueeOffsetPx += deltaSeconds * this.MARQUEE_SPEED_PX_PER_SEC;

        const halfWidth = track.scrollWidth / 2;
        if (halfWidth > 0 && this.marqueeOffsetPx >= halfWidth) {
          this.marqueeOffsetPx -= halfWidth;
          this.rotateWindow();
        }

        track.style.transform = `translateX(-${this.marqueeOffsetPx}px)`;
      }

      this.marqueeLastFrameTime = timestamp;
      this.marqueeAnimationFrameId = requestAnimationFrame(step);
    };

    this.marqueeAnimationFrameId = requestAnimationFrame(step);
  }

  private stopMarqueeScroll(): void {
    if (this.marqueeAnimationFrameId !== null) {
      cancelAnimationFrame(this.marqueeAnimationFrameId);
      this.marqueeAnimationFrameId = null;
    }
  }

  releaseYear(item: CinemaSearchResult): string {
    if (item.mediaType === 'tv' && item.releaseYearRange) return item.releaseYearRange;
    return item.releaseDate ? new Date(item.releaseDate).getFullYear().toString() : 'TBA';
  }

  // "Sep 2026" - shown below the card (not overlaid on the poster).
  releaseMonthYear(item: CinemaSearchResult): string {
    if (item.mediaType === 'tv' && item.releaseYearRange) return item.releaseYearRange;
    if (!item.releaseDate) return 'TBA';
    return new Date(item.releaseDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }

  private isComingSoon(releaseDate?: string | null): boolean {
    if (!releaseDate) return false;
    const todayStr = new Date().toISOString().slice(0, 10);
    return releaseDate.slice(0, 10) > todayStr;
  }

  // Top-left status pill shown on cards where it applies (see MarqueeBadge
  // doc comment above for priority order) - null means no badge at all.
  marqueeBadge(item: CinemaSearchResult): MarqueeBadge {
    if (item.mediaType === 'tv') {
      const episodeBadge = getTvEpisodeBadge(item.lastEpisodeAirDate, item.nextEpisodeAirDate, item.nextEpisodeNumber);
      if (episodeBadge) return { kind: episodeBadge };
      if (this.isComingSoon(item.releaseDate)) return { kind: 'coming-soon' };
      return null;
    }

    const releaseBadge = getMovieReleaseBadge({
      releaseDate: item.releaseDate,
      hadTheatricalRelease: item.hadTheatricalRelease,
      hasStreamingAvailability: item.hasStreamingAvailability,
      digitalReleaseDate: item.digitalReleaseDate,
    });
    if (releaseBadge) return { kind: releaseBadge };
    const rereleaseBadge = getMovieRereleaseBadge(item.rereleaseDate);
    if (rereleaseBadge) return { kind: rereleaseBadge };
    if (this.isComingSoon(item.releaseDate)) return { kind: 'coming-soon' };
    return null;
  }

  // Shortened versions of the shared labels - the marquee's mobile card is
  // only 7rem (112px) wide, so the full shared labels ("Returning to
  // Theaters", "New Season Soon") measured as overflowing the card by
  // 10-28px in testing.
  marqueeBadgeLabel(badge: MarqueeBadge): string {
    if (!badge) return '';
    switch (badge.kind) {
      case 'coming-soon':
        return 'Coming Soon';
      case 'in-theaters':
      case 'new-release':
        return getMovieReleaseBadgeLabel(badge.kind);
      case 'new-season':
        return 'New Season';
      case 'returning-soon':
        return 'Returning Soon';
      case 'back-in-theaters':
        return 'Back Soon';
      default:
        return getTvEpisodeBadgeLabel(badge.kind);
    }
  }

  marqueeBadgeIcon(badge: MarqueeBadge): string {
    return getCinemaBadgeIcon(badge?.kind);
  }
}
