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

  private fullAlbumList: any[] = [];
  private windowStartIndex = 0;
  private readonly WINDOW_SIZE = 20;
  private marqueeAnimationFrameId: number | null = null;
  private marqueeLastFrameTime: number | null = null;
  private marqueeOffsetPx = 0;
  private readonly MARQUEE_SPEED_PX_PER_SEC = 40;
  private firstBatchLoadedCount = 0;
  private scrollStarted = false;
  private readonly FIRST_BATCH_LOAD_TIMEOUT_MS = 3000;

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

  // Angular reuses the DOM element at each position instead of destroying/
  // recreating it when the array is reassigned - the key that makes window
  // rotation cheap (data-only rebind) instead of another mount/unmount cycle.
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

    this.setMarqueeWindow(baseAlbums);
  }

  // Mounts a small fixed pool of DOM cards (WINDOW_SIZE unique albums, doubled
  // for the loop) exactly once - never grows. All albums beyond the initial
  // window get cycled into those same elements later via rotateWindow(), so
  // there's no per-chunk mount cost after the very first render.
  private setMarqueeWindow(fullAlbumList: any[]): void {
    this.fullAlbumList = fullAlbumList;
    this.windowStartIndex = 0;
    this.albums = fullAlbumList.slice(0, this.WINDOW_SIZE);
    this.marqueeImageLoaded = new Array(this.albums.length).fill(false);
    this.isMarqueeLoading = false;
    this.firstBatchLoadedCount = 0;
    this.scrollStarted = false;
    this.cdr.detectChanges();

    this.ngZone.runOutsideAngular(() => {
      // Safety net: start anyway if an image hangs/fails to fire, so the
      // marquee can never get stuck permanently paused.
      setTimeout(() => this.startMarqueeScrollOnce(), this.FIRST_BATCH_LOAD_TIMEOUT_MS);
    });
  }

  // Bound to (load)/(error) on the first copy's images only - once every
  // initially-visible image has settled, start the scroll. Starting before
  // they've loaded is what caused the stutter, since decode work was
  // competing with the already-running scroll animation for the main thread.
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

  // Called when the scroll completes one full loop - swaps in the next
  // WINDOW_SIZE albums' data on the *existing* DOM elements (via trackBy),
  // instead of creating new ones. Wraps back to the start of the full list.
  private rotateWindow(): void {
    if (this.fullAlbumList.length <= this.WINDOW_SIZE) return; // nothing to rotate

    this.windowStartIndex =
      (this.windowStartIndex + this.WINDOW_SIZE) % this.fullAlbumList.length;

    this.albums = Array.from({ length: this.WINDOW_SIZE }, (_, i) =>
      this.fullAlbumList[(this.windowStartIndex + i) % this.fullAlbumList.length]
    );
    this.marqueeImageLoaded = new Array(this.albums.length).fill(false);
    this.cdr.detectChanges();
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

        // Fixed pool size means scrollWidth is constant - once we cross it,
        // rotate in the next window of albums before wrapping the position.
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
