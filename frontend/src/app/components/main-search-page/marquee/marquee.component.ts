import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  NgZone,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { SpotifyService } from 'src/app/services/spotify.service';

// Isolated as its own component, and its chunk/scroll timers run outside Angular's
// zone (see runOutsideAngular below) - a zone-patched setTimeout/rAF triggers a
// global, tree-wide change detection pass regardless of which component scheduled
// it, so component boundaries alone don't scope anything without this.
@Component({
  selector: 'app-marquee',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './marquee.component.html',
  styleUrls: ['./marquee.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarqueeComponent implements OnInit, OnDestroy {
  @Output() cardClick = new EventEmitter<{
    album: any;
    list: any[];
    index: number;
  }>();

  @ViewChild('marqueeContainer') marqueeContainer!: ElementRef;
  @ViewChild('marqueeTrack') marqueeTrack?: ElementRef<HTMLDivElement>;

  albums: any[] = [];
  skeletonArray = Array(10);
  isMarqueeLoading = true;
  marqueeImageLoaded: boolean[] = [];

  private marqueeAnimationFrameId: number | null = null;
  private marqueeLastFrameTime: number | null = null;
  private marqueeOffsetPx = 0;
  private readonly MARQUEE_SPEED_PX_PER_SEC = 40;

  constructor(
    private spotifyService: SpotifyService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) {}

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

  ngOnDestroy(): void {
    this.stopMarqueeScroll();
  }

  onCardClick(album: any, index: number): void {
    this.cardClick.emit({ album, list: this.albums, index });
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

    this.revealMarqueeInChunks(baseAlbums);
  }

  // Reveal the marquee progressively in small chunks instead of mounting all ~110
  // album cards synchronously - keeps the route transition into Home fast, since
  // Angular only has to render/change-detect a small batch up front. The scroll is
  // JS-driven (startMarqueeScroll) at a fixed px/sec rate rather than a CSS %-based
  // keyframe, so a growing track width mid-scroll never causes a visible jump.
  private revealMarqueeInChunks(fullAlbumList: any[]): void {
    const CHUNK_SIZE = 20;
    const CHUNK_DELAY_MS = 600;

    this.albums = fullAlbumList.slice(0, CHUNK_SIZE);
    this.marqueeImageLoaded = new Array(this.albums.length).fill(false);
    this.isMarqueeLoading = false;
    this.cdr.detectChanges();

    this.ngZone.runOutsideAngular(() => {
      setTimeout(() => this.startMarqueeScroll(), 0);

      let nextCount = CHUNK_SIZE;
      const revealNextChunk = () => {
        if (nextCount >= fullAlbumList.length) return;
        nextCount += CHUNK_SIZE;
        this.albums = fullAlbumList.slice(0, nextCount);
        this.cdr.detectChanges();
        if (nextCount < fullAlbumList.length) {
          setTimeout(revealNextChunk, CHUNK_DELAY_MS);
        }
      };
      setTimeout(revealNextChunk, CHUNK_DELAY_MS);
    });
  }

  private startMarqueeScroll(): void {
    if (this.marqueeAnimationFrameId !== null) return; // already running
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

        // Re-measured every frame so appending more chunks never shifts the
        // current position - only where the *next* wrap-around lands.
        const halfWidth = track.scrollWidth / 2;
        if (halfWidth > 0 && this.marqueeOffsetPx >= halfWidth) {
          this.marqueeOffsetPx -= halfWidth;
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
