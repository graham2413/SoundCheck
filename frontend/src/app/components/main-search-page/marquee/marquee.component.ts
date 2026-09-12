import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, OnDestroy, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { animate, animateChild, query, stagger, style, transition, trigger } from '@angular/animations';
import { SpotifyService } from 'src/app/services/spotify.service';

// Static horizontally-scrollable strip (native overflow-x scroll, like the
// person-detail page's filmography row) - no longer auto-scrolling/looping,
// so there's no windowing or rAF animation to manage here anymore.
@Component({
  selector: 'app-marquee',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './marquee.component.html',
  styleUrls: ['./marquee.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Same staggered slide-in used on other results screens (e.g.
  // main-search's own result lists) - plays once the marquee's real cards
  // replace the skeleton loader.
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
export class MarqueeComponent implements OnDestroy, OnInit {
  @Output() cardClick = new EventEmitter<{
    album: any;
    list: any[];
    index: number;
  }>();

  albums: any[] = [];
  loopedAlbums: any[] = [];
  skeletonArray = Array(10);
  isMarqueeLoading = true;
  marqueeImageLoaded: boolean[] = [];
  isAutoScrolling = false;
  private animationFrameId: number | null = null;
  private isPointerOver = false;

  constructor(private spotifyService: SpotifyService, private cdRef: ChangeDetectorRef) {}

  async ngOnInit(): Promise<void> {
    const stored = localStorage.getItem('albumImages');
    let shouldRefetch = true;

    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const cachedAt = parsed.cachedAt || 0;
        const lastFridayNoon = this.getLastFridayNoon();

        if (cachedAt >= lastFridayNoon) {
          shouldRefetch = false; // Cache is fresh
        }
      } catch (e) {
        console.warn('Failed to parse cached albumImages:', e);
      }
    }

    if (shouldRefetch) {
      await this.fetchAndStoreAlbums();
    }

    this.setMarquee();
  }

  onCardClick(album: any, index: number): void {
    const originalIndex = index % this.albums.length;
    this.cardClick.emit({ album: this.albums[originalIndex], list: this.albums, index: originalIndex });
  }

  onImageLoaded(index: number): void {
    this.marqueeImageLoaded[index % this.albums.length] = true;
    if (this.marqueeImageLoaded.every(Boolean)) {
      this.startAutoScroll();
    }
  }

  setPointerOver(isPointerOver: boolean): void {
    this.isPointerOver = isPointerOver;
  }

  trackByIndex(index: number): number {
    return index;
  }

  setMarquee() {
    this.isMarqueeLoading = true;
    const storedAlbums = localStorage.getItem('albumImages');
    let baseAlbums: any[] = [];

    if (storedAlbums) {
      try {
        const parsed = JSON.parse(storedAlbums);
        baseAlbums = parsed.albums || [];
        baseAlbums = baseAlbums.map((album) => ({
          ...album,
          cover: this.getHighQualityImage(album.cover),
        }));
      } catch (e) {
        console.error('Error parsing stored album images:', e);
      }
    }

    if (baseAlbums.length === 0) {
      // fallback defaults
      baseAlbums = Array.from({ length: 10 }, (_, i) => ({
        id: i,
        title: `Static Album ${i + 1}`,
        artist: 'Unknown',
        cover: `assets/album${i + 1}.jpg`,
        releaseType: 'Album',
      }));
    }

    this.albums = baseAlbums;
    this.loopedAlbums = [...this.albums, ...this.albums];
    this.marqueeImageLoaded = new Array(this.albums.length).fill(false);
    this.isMarqueeLoading = false;
    // OnPush won't always repaint on its own once this resolves async - force
    // it so the view doesn't get stuck showing the skeleton loader forever
    // despite the data arriving (see cinema-marquee.component.ts).
    this.cdRef.markForCheck();
  }

  ngOnDestroy(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  private startAutoScroll(): void {
    if (this.isAutoScrolling || this.albums.length === 0) return;

    this.isAutoScrolling = true;
    const scroll = (): void => {
      const track = document.querySelector<HTMLElement>('app-marquee .marquee-track');
      if (!track) {
        this.isAutoScrolling = false;
        return;
      }

      if (!this.isPointerOver) {
        track.scrollLeft += 0.5;
        if (track.scrollLeft >= track.scrollWidth / 2) {
          track.scrollLeft = 0;
        }
      }

      this.animationFrameId = requestAnimationFrame(scroll);
    };

    this.animationFrameId = requestAnimationFrame(scroll);
  }

  getLastFridayNoon(): number {
    const now = new Date();
    const day = now.getDay(); // 0 = Sunday, 5 = Friday
    const daysSinceFriday = day >= 5 ? day - 5 : 7 - (5 - day);
    const lastFriday = new Date(now);
    lastFriday.setDate(now.getDate() - daysSinceFriday);
    lastFriday.setHours(12, 0, 0, 0); // set to 12:00 PM Friday
    return lastFriday.getTime();
  }

  // Compact relative time for the marquee badge, e.g. "1w ago" instead of "1 week ago"
  getShortTimeAgo(value: string | Date): string {
    const date = new Date(value);
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

    const intervals: { label: string; seconds: number }[] = [
      { label: 'y', seconds: 31536000 },
      { label: 'mo', seconds: 2592000 },
      { label: 'w', seconds: 604800 },
      { label: 'd', seconds: 86400 },
      { label: 'h', seconds: 3600 },
      { label: 'm', seconds: 60 },
    ];

    for (const { label, seconds: unitSeconds } of intervals) {
      const interval = Math.floor(seconds / unitSeconds);
      if (interval >= 1) {
        return `${interval}${label} ago`;
      }
    }

    return 'just now';
  }

  fetchAndStoreAlbums(): Promise<void> {
    return new Promise((resolve) => {
      this.spotifyService.getAlbumImages().subscribe({
        next: (data) => {
          localStorage.setItem(
            'albumImages',
            JSON.stringify({
              albums: data.albums,
              cachedAt: Date.now(),
            })
          );
          resolve();
        },
        error: (err) => {
          console.error('Failed to fetch album images:', err);
          resolve(); // Still resolve so app doesn’t hang
        },
      });
    });
  }

  getHighQualityImage(imageUrl: string): string {
    if (!imageUrl) return '';

    // Ensure we're requesting the highest resolution available
    if (imageUrl.includes('api.deezer.com')) {
      return `${imageUrl}?size=xl`;
    }

    return imageUrl;
  }
}
