import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { animate, animateChild, query, stagger, style, transition, trigger } from '@angular/animations';
import { CommonModule } from '@angular/common';
import { SpotifyService } from 'src/app/services/spotify.service';
import { CinemaService } from 'src/app/services/cinema.service';
import { AlbumImage } from '../../../models/responses/album-images-response';
import { CinemaSearchResult } from '../../../models/responses/cinema-response';
import { getCinemaStatusBadge, CinemaBadgeVm } from '../../../shared/cinema-status-badge';
import { CinemaBadgeComponent } from '../../../shared/cinema-badge/cinema-badge.component';

export type SeeAllTrendingKind = 'music' | 'cinema';

// Full-screen "See All" grid, opened from the "Trending Right Now" row's
// "See All" button. Music shows every stored trending album (already only
// ~110, no pagination needed); cinema reuses the same trending endpoint as
// the marquee, with its own Movies/Shows toggle mirroring the marquee's.
@Component({
  selector: 'app-see-all-trending',
  standalone: true,
  imports: [CommonModule, CinemaBadgeComponent],
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

  @Output() back = new EventEmitter<void>();
  @Output() musicCardClick = new EventEmitter<{ album: AlbumImage; list: AlbumImage[]; index: number }>();
  @Output() cinemaCardClick = new EventEmitter<{ item: CinemaSearchResult; list: CinemaSearchResult[]; index: number }>();

  isLoading = true;
  albums: AlbumImage[] = [];
  cinemaItems: CinemaSearchResult[] = [];
  cinemaMode: 'movie' | 'tv' = 'movie';

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
    this.loadData();
  }

  private loadData(): void {
    this.isLoading = true;
    if (this.kind === 'music') {
      this.spotifyService.getAlbumImages().subscribe({
        next: ({ albums }) => {
          this.albums = albums || [];
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
    this.musicCardClick.emit({ album: this.albums[index], list: this.albums, index });
  }

  // Same upscale the marquee applies (see marquee.component.ts) - stored
  // Deezer cover URLs default to a small size unless a bigger one is requested.
  highQualityCover(imageUrl: string): string {
    if (!imageUrl) return '';
    if (imageUrl.includes('api.deezer.com')) return `${imageUrl}?size=xl`;
    return imageUrl;
  }

  onCinemaCardClick(index: number): void {
    this.cinemaCardClick.emit({ item: this.cinemaItems[index], list: this.cinemaItems, index });
  }

  releaseMonthYear(item: CinemaSearchResult): string {
    if (item.mediaType === 'tv' && item.releaseYearRange) return item.releaseYearRange;
    if (!item.releaseDate) return 'TBA';
    return new Date(item.releaseDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }

  // Same badge logic/priority/icons as everywhere else (see shared/cinema-status-badge.ts).
  cinemaBadge(item: CinemaSearchResult): CinemaBadgeVm | null {
    return getCinemaStatusBadge(item);
  }
}
