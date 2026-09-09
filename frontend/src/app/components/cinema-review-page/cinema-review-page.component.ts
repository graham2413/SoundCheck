import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, OnChanges, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { animate, style, transition, trigger } from '@angular/animations';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { PROVIDER_LOGO_OVERRIDES } from '../../shared/provider-logo-overrides';
import { getCinemaStatusBadge, withShortBadgeLabel, CinemaBadgeVm } from '../../shared/cinema-status-badge';
import { CinemaBadgeComponent } from '../../shared/cinema-badge/cinema-badge.component';
import { CinemaSortDropdownComponent, CinemaDropdownOption } from '../../shared/cinema-sort-dropdown/cinema-sort-dropdown.component';
import { CinemaEpisodesTabComponent } from './cinema-episodes-tab.component';
import { CinemaReview, CinemaPersonCredit, CinemaSeasonEpisode, EpisodeImdbRating } from '../../models/responses/cinema-response';

export interface WatchProvider {
  name: string;
  logoUrl: string | null;
}

export type ReviewFilter = 'all' | 'mine';
export type ReviewSort = 'recent' | 'highest' | 'liked';

// New unified (single responsive layout, no separate mobile/desktop
// templates) cinema review detail page - built top-down in chunks against
// the provided mockup. Movies first; TV/season-episode support comes later.
// Kept fully separate from the existing shared review-page component so the
// music review flow isn't touched while this is iterated on.
@Component({
  selector: 'app-cinema-review-page',
  standalone: true,
  imports: [CommonModule, FormsModule, CinemaBadgeComponent, CinemaSortDropdownComponent, CinemaEpisodesTabComponent],
  templateUrl: './cinema-review-page.component.html',
  styleUrls: ['./cinema-review-page.component.css'],
  animations: [
    trigger('slideDown', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-12px)' }),
        animate('250ms ease-out', style({ opacity: 1, transform: 'translateY(0)' })),
      ]),
    ]),
  ],
})
export class CinemaReviewPageComponent implements OnInit, OnChanges, AfterViewInit {
  @Input() title = '';
  @Input() cover: string | null = null;
  @Input() mediaType: 'movie' | 'tv' | null = null;
  @Input() tmdbId: string | null = null;
  @Input() imdbId: string | null = null;
  @Input() year: number | null = null;
  @Input() releaseYearRange: string | null = null;
  @Input() runtimeMinutes: number | null = null;
  @Input() certification: string | null = null;
  @Input() releaseDate: string | null = null;
  @Input() rereleaseDate: string | null = null;
  @Input() hadTheatricalRelease = false;
  @Input() digitalReleaseDate: string | null = null;
  @Input() status: string | null = null;
  @Input() lastEpisodeAirDate: string | null = null;
  @Input() nextEpisodeAirDate: string | null = null;
  @Input() nextEpisodeNumber: number | null = null;
  @Input() genres: string[] = [];
  @Input() appRating: number | null = null;
  @Input() appReviewCount: number | null = null;
  @Input() imdbRating: number | null = null;
  @Input() imdbVoteCount: number | null = null;
  @Input() isWatchlist = false;
  @Input() isWatched = false;
  @Input() isTogglingWatchlist = false;
  @Input() isTogglingWatched = false;
  @Input() description: string | null = null;
  @Input() director: string | null = null;
  @Input() awardsSummary: string | null = null;
  @Input() boxOffice: string | null = null;
  @Input() budget: string | null = null;
  @Input() numberOfSeasons: number | null = null;
  @Input() watchProviders: WatchProvider[] = [];
  @Input() images: { backdrops: string[]; posters: string[] } = { backdrops: [], posters: [] };
  @Input() trailerKey: string | null = null;
  @Input() similar: CinemaPersonCredit[] = [];

  // Reviews tab (chunk 1: in-place preview list; "See All" navigates to a
  // dedicated full-screen list in a later chunk).
  @Input() reviews: CinemaReview[] = [];
  @Input() userReview: CinemaReview | null = null;
  @Input() currentUserId: string | null = null;
  @Input() reviewFilter: ReviewFilter = 'all';
  @Input() reviewSort: ReviewSort = 'recent';

  @Output() back = new EventEmitter<void>();
  @Output() addToWatchlist = new EventEmitter<void>();
  @Output() rate = new EventEmitter<void>();
  @Output() markWatched = new EventEmitter<void>();
  @Output() viewCast = new EventEmitter<void>();
  @Output() viewAwards = new EventEmitter<void>();
  @Output() seeAllProviders = new EventEmitter<void>();
  @Output() similarItemClick = new EventEmitter<CinemaPersonCredit>();

  @Output() reviewFilterChange = new EventEmitter<ReviewFilter>();
  @Output() reviewSortChange = new EventEmitter<ReviewSort>();
  @Output() toggleReviewLike = new EventEmitter<CinemaReview>();
  @Output() seeAllReviews = new EventEmitter<void>();

  isDescriptionExpanded = false;
  isDescriptionOverflowing = false;
  posterLoaded = false;
  isTrailerFullScreen = false;

  // Fullscreen image viewer state - poster + gallery images treated as one
  // navigable list so the next/previous buttons work across both. Rendered
  // as a 3-slide (prev/current/next) track so navigating slides continuously
  // (like a native photo viewer) instead of an instant image swap.
  // Touch/coarse-pointer devices swipe (see onFullScreenPointer* below) and
  // the left/right buttons are hidden there via CSS (see .poster-fullscreen-nav's
  // (hover: none) media query) - mouse/trackpad users still get the buttons.
  private fullScreenImages: string[] = [];
  private fullScreenIndex = 0;
  isSwiping = false; // disables the CSS transition only during the instant-reset step after a slide completes, and live while actively dragging
  dragOffsetPx = 0;
  private static readonly SWIPE_TRANSITION_MS = 250;
  private static readonly SWIPE_THRESHOLD_PX = 60;
  private isDragging = false;
  private activePointerId: number | null = null;
  private dragStartX = 0;

  @ViewChild('descriptionEl') descriptionEl?: ElementRef<HTMLElement>;
  @ViewChild('galleryRow') galleryRow?: ElementRef<HTMLElement>;
  @ViewChild('trailerOverlay') trailerOverlay?: ElementRef<HTMLElement>;
  @ViewChild('fullScreenTrack') fullScreenTrack?: ElementRef<HTMLElement>;

  constructor(private sanitizer: DomSanitizer, private elementRef: ElementRef<HTMLElement>) {}

  markPosterLoaded(): void {
    this.posterLoaded = true;
  }

  // Shared by the poster and the "More images" gallery below - tap any of
  // them to view full screen, landing on whichever one was tapped within
  // the combined poster+gallery list so next/previous can move through all of them.
  openFullScreenImage(url: string | null): void {
    if (!url) return;
    this.fullScreenImages = [this.cover, ...this.galleryImages].filter((u): u is string => !!u);
    this.fullScreenIndex = Math.max(0, this.fullScreenImages.indexOf(url));
    this.dragOffsetPx = 0;
    this.setBackgroundScrollLocked(true);
  }

  closeFullScreenImage(): void {
    this.fullScreenImages = [];
    this.setBackgroundScrollLocked(false);
  }

  // The overlay itself is position:fixed and never scrolls, but the modal
  // page underneath it (its own overflow-y-auto scroll container, not the
  // page body) stayed scrollable the whole time - a stray scroll on that
  // container while pinching/swiping the image on top made both gestures
  // fight each other. Locking it only while the viewer is open fixes that
  // without needing to know which modal/host is doing the scrolling.
  private scrollLockContainer: HTMLElement | null = null;

  private setBackgroundScrollLocked(locked: boolean): void {
    if (locked) {
      this.scrollLockContainer = this.elementRef.nativeElement.closest<HTMLElement>('.overflow-y-auto');
      if (this.scrollLockContainer) this.scrollLockContainer.style.overflow = 'hidden';
    } else if (this.scrollLockContainer) {
      this.scrollLockContainer.style.overflow = '';
      this.scrollLockContainer = null;
    }
  }

  // The <img> element itself always spans the full 100vw x 100% box
  // (object-fit:contain only affects how the pixels are drawn *inside* that
  // box) - so a plain stopPropagation() on the image would swallow clicks on
  // the empty letterbox padding too, not just the visible photo. Compute the
  // actual rendered content rect and only block the close-on-outside-click
  // when the tap landed within it.
  onFullScreenImageClick(event: MouseEvent): void {
    const img = event.currentTarget as HTMLImageElement;
    const rect = img.getBoundingClientRect();
    if (!img.naturalWidth || !img.naturalHeight || !rect.width || !rect.height) return;

    const naturalRatio = img.naturalWidth / img.naturalHeight;
    const boxRatio = rect.width / rect.height;

    let left = rect.left;
    let right = rect.right;
    let top = rect.top;
    let bottom = rect.bottom;

    if (naturalRatio > boxRatio) {
      // Image is relatively wider than its box - letterboxed top/bottom.
      const renderedHeight = rect.width / naturalRatio;
      const offsetY = (rect.height - renderedHeight) / 2;
      top = rect.top + offsetY;
      bottom = top + renderedHeight;
    } else {
      // Image is relatively taller/narrower than its box - letterboxed left/right.
      const renderedWidth = rect.height * naturalRatio;
      const offsetX = (rect.width - renderedWidth) / 2;
      left = rect.left + offsetX;
      right = left + renderedWidth;
    }

    const clickedInsidePhoto =
      event.clientX >= left && event.clientX <= right && event.clientY >= top && event.clientY <= bottom;

    if (clickedInsidePhoto) {
      event.stopPropagation();
    }
    // Otherwise let it bubble up to the overlay's closeFullScreenImage().
  }

  get fullScreenImageUrl(): string | null {
    return this.fullScreenImages[this.fullScreenIndex] ?? null;
  }

  get prevFullScreenImageUrl(): string | null {
    if (this.fullScreenImages.length < 2) return this.fullScreenImageUrl;
    const idx = (this.fullScreenIndex - 1 + this.fullScreenImages.length) % this.fullScreenImages.length;
    return this.fullScreenImages[idx];
  }

  get nextFullScreenImageUrl(): string | null {
    if (this.fullScreenImages.length < 2) return this.fullScreenImageUrl;
    const idx = (this.fullScreenIndex + 1) % this.fullScreenImages.length;
    return this.fullScreenImages[idx];
  }

  get hasMultipleFullScreenImages(): boolean {
    return this.fullScreenImages.length > 1;
  }

  // Slides in track order (prev/current/next), for *ngFor+trackBy below.
  // Rendering these via ngFor keyed on the URL (rather than 3 fixed <img>
  // tags bound to prev/current/next by position) lets Angular reuse the
  // same DOM node - and its already-decoded bitmap - when a URL shifts from
  // one role to another after a swipe. Without this, snapping the track
  // back to center at the end of settleAfterSwipe() re-assigns `src` on a
  // *different* <img> element than the one that was already showing that
  // picture, forcing a fresh decode that briefly flashes the old image on
  // slower (mobile) devices.
  get fullScreenSlides(): string[] {
    return [this.prevFullScreenImageUrl, this.fullScreenImageUrl, this.nextFullScreenImageUrl].filter(
      (u): u is string => !!u
    );
  }

  trackByFullScreenUrl(_index: number, url: string): string {
    return url;
  }

  // "3 / 12" counter shown centered at the top of the viewer.
  get fullScreenImageCounter(): string | null {
    if (!this.hasMultipleFullScreenImages) return null;
    return `${this.fullScreenIndex + 1} / ${this.fullScreenImages.length}`;
  }

  // The track holds 3 full-viewport-width slides (prev/current/next) -
  // centered at rest by sitting on the middle slide, offset live by
  // dragOffsetPx while swiping.
  get trackTransform(): string {
    return `translateX(calc(-100vw + ${this.dragOffsetPx}px))`;
  }

  private nextFullScreenImage(): void {
    if (!this.fullScreenImages.length) return;
    this.fullScreenIndex = (this.fullScreenIndex + 1) % this.fullScreenImages.length;
  }

  private prevFullScreenImage(): void {
    if (!this.fullScreenImages.length) return;
    this.fullScreenIndex = (this.fullScreenIndex - 1 + this.fullScreenImages.length) % this.fullScreenImages.length;
  }

  // Button-click equivalent of a completed swipe - animates the track the
  // rest of the way to the next/previous slide instead of an instant swap.
  animateNextFullScreenImage(): void {
    this.animateToSlide(true);
  }

  animatePrevFullScreenImage(): void {
    this.animateToSlide(false);
  }

  // Touch/mouse drag-to-swipe - only one active pointer drives the drag;
  // if a second finger comes down mid-drag (a pinch-zoom attempt) the drag
  // is abandoned instead of racing it, so native pinch-zoom can take over.
  onFullScreenPointerDown(event: PointerEvent): void {
    if (!this.hasMultipleFullScreenImages || this.isSettlingSwipe) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (this.isDragging) {
      this.cancelFullScreenDrag();
      return;
    }
    this.isDragging = true;
    this.activePointerId = event.pointerId;
    this.dragStartX = event.clientX;
    this.isSwiping = true; // no transition while actively dragging, follows the finger 1:1
  }

  onFullScreenPointerMove(event: PointerEvent): void {
    if (!this.isDragging || event.pointerId !== this.activePointerId) return;
    this.dragOffsetPx = event.clientX - this.dragStartX;
  }

  onFullScreenPointerUp(event: PointerEvent): void {
    if (!this.isDragging || event.pointerId !== this.activePointerId) return;
    const offset = this.dragOffsetPx;
    this.isDragging = false;
    this.activePointerId = null;
    this.isSwiping = false; // re-enable the transition for the settle/snap-back below

    if (Math.abs(offset) > CinemaReviewPageComponent.SWIPE_THRESHOLD_PX) {
      this.animateToSlide(offset < 0);
    } else {
      this.dragOffsetPx = 0; // didn't drag far enough - snap back to center
    }
  }

  onFullScreenPointerCancel(): void {
    this.cancelFullScreenDrag();
  }

  private cancelFullScreenDrag(): void {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.activePointerId = null;
    this.isSwiping = false;
    this.dragOffsetPx = 0;
  }

  private animateToSlide(goingNext: boolean): void {
    if (!this.hasMultipleFullScreenImages || this.isSettlingSwipe) return;
    this.isSwiping = false; // ensure the transition is enabled
    this.dragOffsetPx = goingNext ? -window.innerWidth : window.innerWidth;
    this.settleAfterSwipe(goingNext);
  }

  // Snaps the track instantly back to center (no transition) after the
  // slide/index change, then re-enables the transition on the next frame -
  // same double-rAF technique used for ringsReady above, to avoid a visible
  // flicker from the instant reset. Blocks a new nav click from starting
  // until this fully settles (isSettlingSwipe) - a rapid double-tap mid-reset
  // could otherwise race with the pending index swap and jump to the wrong image.
  private isSettlingSwipe = false;

  private settleAfterSwipe(goingNext: boolean): void {
    this.isSettlingSwipe = true;
    const track = this.fullScreenTrack?.nativeElement;
    let swapped = false;

    const swap = () => {
      if (swapped) return;
      swapped = true;
      if (goingNext) this.nextFullScreenImage();
      else this.prevFullScreenImage();
      this.isSwiping = true;
      this.dragOffsetPx = 0;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          this.isSwiping = false;
          this.isSettlingSwipe = false;
        })
      );
    };

    // Swap exactly when the slide-out CSS transition actually finishes,
    // instead of a fixed setTimeout guessed to match its duration - a real
    // device occasionally painting a frame or two slower than that guess is
    // what caused the intermittent "briefly shows another image" jitter.
    // The timeout below is only a safety net in case transitionend never
    // fires (e.g. the tab gets backgrounded mid-animation).
    if (track) {
      const onTransitionEnd = (e: Event) => {
        if ((e as TransitionEvent).propertyName !== 'transform') return;
        track.removeEventListener('transitionend', onTransitionEnd);
        swap();
      };
      track.addEventListener('transitionend', onTransitionEnd);
      setTimeout(() => track.removeEventListener('transitionend', onTransitionEnd), CinemaReviewPageComponent.SWIPE_TRANSITION_MS + 150);
    }
    setTimeout(swap, CinemaReviewPageComponent.SWIPE_TRANSITION_MS + 150);
  }

  // "More images" gallery - backdrops first (widescreen scene/promo shots),
  // then alternate posters, skipping whichever poster's already shown up top.
  get galleryImages(): string[] {
    return [...this.images.backdrops, ...this.images.posters.filter((url) => url !== this.cover)];
  }

  // Loading-spinner state per thumbnail, same convention as the marquee's
  // cards (main-search's app-marquee/app-cinema-marquee).
  galleryImageLoaded: boolean[] = [];

  scrollGallery(direction: 1 | -1): void {
    const el = this.galleryRow?.nativeElement;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' });
  }

  // bypassSecurityTrustResourceUrl is required for any *dynamic* iframe src -
  // Angular blocks it otherwise since iframe src is a RESOURCE_URL sink.
  // Safe here since trailerKey only ever comes from our own backend's TMDb
  // passthrough, never raw user input.
  //
  // Memoized (not recomputed on every call) - a getter that returns a fresh
  // SafeResourceUrl object each time makes Angular see the iframe's [src]
  // binding as "changed" on every change-detection cycle, even when the
  // underlying URL is identical, which reloads the iframe and restarts the
  // video. That's exactly what caused clicking the player to restart
  // instead of pause: any click triggers CD, CD re-evaluates this getter,
  // and the "new" object reference looked like a real src change.
  private cachedTrailerKey: string | null = null;
  private cachedTrailerEmbedUrl: SafeResourceUrl | null = null;

  get trailerEmbedUrl(): SafeResourceUrl | null {
    if (!this.trailerKey) return null;
    if (this.cachedTrailerKey !== this.trailerKey) {
      this.cachedTrailerKey = this.trailerKey;
      this.cachedTrailerEmbedUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
        `https://www.youtube.com/embed/${this.trailerKey}?autoplay=1&rel=0`
      );
    }
    return this.cachedTrailerEmbedUrl;
  }

  playTrailerFullScreen(): void {
    if (!this.trailerKey) return;
    this.isTrailerFullScreen = true;
    // Synchronous, in the same call stack as the click - the overlay
    // element already exists (it's always in the DOM, just hidden), so this
    // doesn't need to wait a tick like the old *ngIf'd version did. Browsers
    // reject requestFullscreen() calls that aren't part of a real user
    // gesture's call stack (e.g. after a setTimeout/microtask), which is
    // exactly what silently broke it before.
    this.trailerOverlay?.nativeElement.requestFullscreen?.().catch(() => {});
  }

  closeTrailerFullScreen(): void {
    this.isTrailerFullScreen = false;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }

  // Keeps isTrailerFullScreen in sync if the user exits fullscreen via
  // Escape or the browser/OS's own control instead of our close button -
  // otherwise the dark overlay would stay stuck open behind the exited player.
  @HostListener('document:fullscreenchange')
  onFullscreenChange(): void {
    if (!document.fullscreenElement && this.isTrailerFullScreen) {
      this.isTrailerFullScreen = false;
    }
  }

  // "Episodes" only shows up as a tab for TV shows we actually have season
  // data for - inserted right after Overview to match the mockup's ordering.
  // "Trailer" moved out of the tab strip entirely into an Overview row-link
  // (see detail-rows) - playTrailerFullScreen() still opens the exact same
  // fullscreen player, just triggered from there instead.
  get tabs(): string[] {
    const episodesTab = this.mediaType === 'tv' && this.numberOfSeasons ? ['Episodes'] : [];
    return ['Overview', ...episodesTab, 'Reviews', 'Similar'];
  }
  activeTab = 'Overview';

  // Once true, stays true for the rest of this page view - see the
  // Episodes block in the template for why (keeps its already-fetched
  // data alive across tab switches instead of re-fetching every time).
  hasOpenedEpisodesTab = false;

  @Output() tabChange = new EventEmitter<void>();
  @ViewChild('tabsRow') tabsRow?: ElementRef<HTMLElement>;

  // Bubbled straight up from app-cinema-episodes-tab - see that component's
  // episodeSelected output for the payload shape.
  @Output() episodeSelected = new EventEmitter<{
    episode: CinemaSeasonEpisode;
    seasonNumber: number;
    seasonPosterUrl: string | null;
    imdbRating: EpisodeImdbRating | null;
  }>();

  selectTab(tab: string): void {
    this.activeTab = tab;
    if (tab === 'Episodes') this.hasOpenedEpisodesTab = true;
    this.tabChange.emit();
    // Scroll so the tabs row lands at the top of the view immediately - not
    // the parent modal's old "scroll to bottom" behavior, which overshot
    // straight past the newly-selected tab's content on every tab switch,
    // and not waiting for Episodes' real data to load either: the loading
    // placeholder already reserves the right amount of space, so scrolling
    // right away lands correctly on "Loading Season X..." instead of a stale
    // position. Deferred a tick so the new tab's content has actually
    // rendered first (only one scroll call per switch - never combine this
    // with a second, content-driven scroll for the same transition, which
    // can make the browser overshoot way past the target).
    setTimeout(() => this.scrollTabsRowIntoView());
  }

  private scrollTabsRowIntoView(): void {
    this.tabsRow?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Scrolls back to the tabs row the moment a season switch is initiated -
  // same immediate behavior as selectTab, not waiting for the new season's
  // episodes to actually finish loading.
  onEpisodesSeasonChanging(): void {
    setTimeout(() => this.scrollTabsRowIntoView());
  }

  // One-time catch-up scroll for the very first time Episodes is opened -
  // at that instant the page has no episode content yet, so selectTab()'s
  // immediate scroll can only reach as far as the (too-short) page already
  // allows. Once real content has actually grown the page, scroll again to
  // reach the true target. Season switches/later re-visits don't need this -
  // by then the page is already tall enough for the immediate scroll alone.
  onFirstEpisodesLoaded(): void {
    setTimeout(() => this.scrollTabsRowIntoView());
  }

  // Reviewer avatar load state, keyed by review._id (or 'prompt' for the
  // "Your Review" card's avatar) - same loader-overlay pattern used for
  // profile pictures everywhere else in the app (friends list, watchlist, etc).
  private avatarLoaded: { [key: string]: boolean } = {};

  markAvatarLoaded(key: string): void {
    this.avatarLoaded[key] = true;
  }

  isAvatarLoaded(key: string): boolean {
    return this.avatarLoaded[key] === true;
  }

  // Same Cloudinary face-centered crop used for profile pictures everywhere
  // else in the app (friends list, navbar, review pages, etc) - without
  // this, object-cover centers on the image's geometric middle, not the
  // face, so off-center source photos look wrong in the small round avatar.
  profilePictureUrl(url: string | null | undefined): string {
    if (!url) return 'assets/user.png';
    return url.replace('/upload/', '/upload/w_400,h_400,c_fill,g_face,f_auto,q_auto/');
  }

  private static readonly VISIBLE_PROVIDER_COUNT = 5;

  get visibleWatchProviders(): WatchProvider[] {
    return this.watchProviders.slice(0, CinemaReviewPageComponent.VISIBLE_PROVIDER_COUNT);
  }

  get remainingWatchProviderCount(): number {
    return Math.max(0, this.watchProviders.length - CinemaReviewPageComponent.VISIBLE_PROVIDER_COUNT);
  }

  // Prefers a locally-bundled higher-res logo over TMDb's (capped at 332x332).
  providerLogoUrl(provider: WatchProvider): string | null {
    return PROVIDER_LOGO_OVERRIDES[provider.name] || provider.logoUrl;
  }

  private static readonly REVIEW_PREVIEW_COUNT = 2;

  get filteredReviews(): CinemaReview[] {
    if (this.reviewFilter === 'mine') {
      return this.reviews.filter((r) => r.user._id === this.currentUserId);
    }
    return this.reviews;
  }

  get previewReviews(): CinemaReview[] {
    return this.filteredReviews.slice(0, CinemaReviewPageComponent.REVIEW_PREVIEW_COUNT);
  }

  get hasMoreReviews(): boolean {
    return this.filteredReviews.length > this.previewReviews.length;
  }

  get userHasWrittenReview(): boolean {
    return !!this.userReview?.reviewText;
  }

  // userReview exists (they rated) but hasn't written text yet - nudge card.
  get showWriteReviewPrompt(): boolean {
    return !!this.userReview && !this.userHasWrittenReview;
  }

  isReviewLiked(review: CinemaReview): boolean {
    return !!this.currentUserId && !!review.likedBy?.includes(this.currentUserId);
  }

  // 5-star display converted from the 0-10 decimalRating, with PARTIAL fill
  // per star (e.g. 8.2/10 -> 4.1/5 -> star #5 renders 10% filled), not
  // rounded to the nearest half/whole star.
  starFillPercent(starIndex: number, decimalRating: number | undefined): number {
    const rating5 = (decimalRating ?? 0) / 2;
    return Math.max(0, Math.min(100, (rating5 - (starIndex - 1)) * 100));
  }

  onReviewFilterChange(filter: ReviewFilter): void {
    this.reviewFilter = filter;
    this.reviewFilterChange.emit(filter);
  }

  onReviewSortChange(sort: string): void {
    this.reviewSort = sort as ReviewSort;
    this.reviewSortChange.emit(this.reviewSort);
  }

  readonly reviewSortOptions: CinemaDropdownOption[] = [
    { value: 'recent', label: 'Most Recent' },
    { value: 'highest', label: 'Highest Rated' },
    { value: 'liked', label: 'Most Liked' },
  ];

  private static readonly RING_RADIUS = 45;

  // Same badge logic/priority/icons as everywhere else (see shared/cinema-status-badge.ts).
  get detailBadge(): CinemaBadgeVm | null {
    return getCinemaStatusBadge({
      mediaType: this.mediaType || 'movie',
      releaseDate: this.releaseDate,
      hadTheatricalRelease: this.hadTheatricalRelease,
      hasStreamingAvailability: this.watchProviders.length > 0,
      digitalReleaseDate: this.digitalReleaseDate,
      rereleaseDate: this.rereleaseDate,
      lastEpisodeAirDate: this.lastEpisodeAirDate,
      nextEpisodeAirDate: this.nextEpisodeAirDate,
      nextEpisodeNumber: this.nextEpisodeNumber,
    });
  }

  // "Similar" tab - same badge logic as everywhere else, and same caveat as
  // the person-detail filmography: these items only carry mediaType/
  // releaseDate, so in practice only "Coming Soon" can ever show here.
  // Short labels since these cards are narrower than the See All grid.
  similarImageLoaded: boolean[] = [];

  similarBadge(item: CinemaPersonCredit): CinemaBadgeVm | null {
    return withShortBadgeLabel(getCinemaStatusBadge(item));
  }

  similarReleaseDate(item: CinemaPersonCredit): string {
    if (!item.releaseDate) return 'TBA';
    return new Date(item.releaseDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }

  get ringCircumference(): number {
    return 2 * Math.PI * CinemaReviewPageComponent.RING_RADIUS;
  }

  // Both rings start at 0% and animate in on first render, rather than the
  // IMDb ring (whose rating is already known at creation time) snapping
  // straight to its final value while only the app ring (whose rating
  // arrives a moment later via a separate reviews fetch) happened to animate.
  ringsReady = false;

  ngOnInit(): void {
    // Double rAF (not setTimeout(fn, 0)) - guarantees the browser actually
    // paints the empty ring at least once before flipping to the real
    // value, so the CSS transition reliably plays. A single setTimeout(0)
    // can get batched with the value update into one paint on a fast local
    // dev server, silently skipping the animation.
    requestAnimationFrame(() => requestAnimationFrame(() => (this.ringsReady = true)));
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['description']) {
      this.isDescriptionExpanded = false;
      // Wait for the clamped paragraph to render before measuring it.
      setTimeout(() => this.checkDescriptionOverflow());
    }
    if (changes['similar']) {
      this.similarImageLoaded = [];
    }
    if (changes['images']) {
      this.galleryImageLoaded = [];
    }
  }

  ngAfterViewInit(): void {
    // Deferred (not called synchronously here) - mutating a bound value
    // synchronously inside ngAfterViewInit runs before Angular's dev-mode
    // checkNoChanges pass has finished, which throws NG0100
    // (ExpressionChangedAfterItHasBeenCheckedError).
    setTimeout(() => this.checkDescriptionOverflow());
  }

  // "Read more" should only appear when the description is actually clamped
  // past 3 lines - short descriptions were always showing the button even
  // though there was nothing left to expand.
  private checkDescriptionOverflow(): void {
    const el = this.descriptionEl?.nativeElement;
    this.isDescriptionOverflowing = !!el && el.scrollHeight > el.clientHeight + 1;
  }

  get appRingDashoffset(): number {
    return this.ringsReady ? this.ringDashoffset(this.appRating) : this.ringCircumference;
  }

  get imdbRingDashoffset(): number {
    return this.ringsReady ? this.ringDashoffset(this.imdbRating) : this.ringCircumference;
  }

  get formattedAppReviewCount(): string | null {
    return this.appReviewCount != null ? this.appReviewCount.toLocaleString('en-US') : null;
  }

  get formattedImdbVoteCount(): string | null {
    return this.imdbVoteCount != null ? this.imdbVoteCount.toLocaleString('en-US') : null;
  }

  get formattedAppRating(): string | null {
    return this.appRating != null ? this.appRating.toFixed(1) : null;
  }

  get formattedImdbRating(): string | null {
    return this.imdbRating != null ? this.imdbRating.toFixed(1) : null;
  }

  private ringDashoffset(rating: number | null): number {
    const fraction = Math.max(0, Math.min(1, (rating ?? 0) / 10));
    return this.ringCircumference * (1 - fraction);
  }

  get runtimeLabel(): string | null {
    if (!this.runtimeMinutes) return null;
    const hours = Math.floor(this.runtimeMinutes / 60);
    const minutes = this.runtimeMinutes % 60;
    if (hours && minutes) return `${hours}h ${minutes}m`;
    if (hours) return `${hours}h`;
    return `${minutes}m`;
  }

  get isUpcoming(): boolean {
    return !!this.releaseDate && this.parseLocalDate(this.releaseDate) > new Date();
  }

  get formattedReleaseDate(): string | null {
    if (!this.releaseDate) return null;
    return this.parseLocalDate(this.releaseDate).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  // Shown instead of a date for titles with no releaseDate at all (e.g. "In
  // Production" movies/shows announced before a date is set) - TMDb's status
  // field is already human-readable ("In Production", "Post Production",
  // "Planned", "Returning Series", etc), just passed through as-is.
  get formattedStatus(): string | null {
    return !this.releaseDate && this.status ? this.status : null;
  }

  // releaseDate is a date-only string (e.g. "2026-12-25") - parsing it
  // directly with `new Date()` treats it as UTC midnight, which shifts a day
  // back in timezones behind UTC once read back via local getters/toLocaleDateString.
  private parseLocalDate(dateOnly: string): Date {
    const [year, month, day] = dateOnly.slice(0, 10).split('-').map(Number);
    return new Date(year, month - 1, day);
  }
}
