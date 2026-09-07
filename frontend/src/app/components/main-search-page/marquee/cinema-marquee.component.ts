import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { animate, animateChild, query, stagger, style, transition, trigger } from '@angular/animations';
import { CinemaService } from 'src/app/services/cinema.service';
import { CinemaSearchResult } from '../../../models/responses/cinema-response';
import { getCinemaStatusBadge, CinemaBadgeVm } from '../../../shared/cinema-status-badge';
import { CinemaBadgeComponent } from '../../../shared/cinema-badge/cinema-badge.component';

// Cinema counterpart to app-marquee - static horizontally-scrollable strip
// (native overflow-x scroll), sourced from GET /cinema/trending, with taller
// 2:3 poster cards instead of square album art. `mode` is owned by the
// parent (main-search.component) so the Movies/Shows toggle next to
// "Trending Right Now" can switch it.
@Component({
  selector: 'app-cinema-marquee',
  standalone: true,
  imports: [CommonModule, CinemaBadgeComponent],
  templateUrl: './cinema-marquee.component.html',
  styleUrls: ['./cinema-marquee.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Same staggered slide-in used on other results screens - plays once the
  // marquee's real cards replace the skeleton loader.
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
export class CinemaMarqueeComponent implements OnInit, OnChanges {
  @Input() mode: 'movie' | 'tv' = 'movie';
  @Output() cardClick = new EventEmitter<{
    item: CinemaSearchResult;
    list: CinemaSearchResult[];
    index: number;
  }>();

  items: CinemaSearchResult[] = [];
  skeletonArray = Array(10);
  isMarqueeLoading = true;
  marqueeImageLoaded: boolean[] = [];

  private readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000; // matches the backend's 24h Redis cache

  constructor(private cinemaService: CinemaService) {}

  async ngOnInit(): Promise<void> {
    await this.loadForMode();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['mode'] && !changes['mode'].firstChange) {
      this.loadForMode();
    }
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
    this.items = fullItemList;
    this.marqueeImageLoaded = new Array(this.items.length).fill(false);
    this.isMarqueeLoading = false;
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

  // Same kind/priority/icon logic as everywhere else (see cinema-status-
  // badge.ts), just with shortened labels - the marquee's mobile card is
  // only 7rem (112px) wide, so the full shared labels ("Returning to
  // Theaters", "New Season Soon") measured as overflowing the card by
  // 10-28px in testing.
  marqueeBadge(item: CinemaSearchResult): CinemaBadgeVm | null {
    const badge = getCinemaStatusBadge(item);
    if (!badge) return null;

    const shortLabels: Partial<Record<string, string>> = {
      'new-season': 'New Season',
      'returning-soon': 'Returning Soon',
      'back-in-theaters': 'Back Soon',
      'new-episode': 'Episode',
    };
    const shortLabel = shortLabels[badge.kind];
    return shortLabel ? { ...badge, label: shortLabel } : badge;
  }
}
