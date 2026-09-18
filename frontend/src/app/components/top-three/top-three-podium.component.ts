import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { Router } from '@angular/router';
import { combineLatest, Observable, timer } from 'rxjs';
import { switchMap, take } from 'rxjs/operators';
import { NgbModal, NgbModalOptions, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { TopThreeService } from 'src/app/services/top-three.service';
import { AppLoaderService } from 'src/app/services/app-loader.service';
import { TopThreeCategory, TopThreeItem, TopThreeResponse } from 'src/app/models/responses/top-three.response';
import { ReviewPageComponent } from '../review-page/review-page.component';
import { CinemaReviewModalComponent } from '../cinema-review-page/cinema-review-modal.component';
import { CinemaRateModalComponent } from '../cinema-review-page/cinema-rate-modal.component';
import { CinemaItem } from 'src/app/models/responses/cinema-response';

type TopThreeGroup = 'cinema' | 'music';

const GROUP_CATEGORIES: Record<TopThreeGroup, TopThreeCategory[]> = {
  cinema: ['movies', 'shows'],
  music: ['songs', 'albums', 'artists'],
};

const CATEGORY_LABELS: Record<TopThreeCategory, string> = {
  movies: 'Movies',
  shows: 'Shows',
  songs: 'Songs',
  albums: 'Albums',
  artists: 'Artists',
};

// A category only counts as "populated" once it actually has all 3 - matches
// the app-wide rule that partial picks (1 or 2) don't count, whether the
// category is on auto (computed live from ratings) or manually curated.
const REQUIRED_ITEM_COUNT = 3;

// How long to hold the populated podium back after the app's full-screen
// boot loader has actually finished fading away (see AppLoaderService and
// the comment in load() below) before revealing it and starting its
// entrance animation.
const REVEAL_DELAY_AFTER_LOADER_MS = 500;

@Component({
  selector: 'app-top-three-podium',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './top-three-podium.component.html',
  styleUrls: ['./top-three-podium.component.css'],
})
export class TopThreePodiumComponent implements OnInit, OnChanges {
  @Input() profileUserId!: string;
  @Input() isOwnProfile = false;

  readonly categoryLabels = CATEGORY_LABELS;

  data: TopThreeResponse | null = null;
  isLoading = true;
  isPrivate = false;

  activeGroup: TopThreeGroup = 'cinema';
  activeCategory: TopThreeCategory = 'movies';

  // Drives the category dropdown (Movies/Shows/Songs/etc) opening below its
  // trigger pill - closed by picking an option or by the backdrop click.
  isCategoryMenuOpen = false;

  // Keyed by item id (not rank) so a cover that's already loaded once stays
  // marked loaded if it reappears (e.g. switching away from and back to a
  // category) instead of re-showing the spinner for an image already in the
  // browser's cache.
  imageLoaded: { [itemId: string]: boolean } = {};

  // Bumped every time the populated podium (re)appears, so the rise-in CSS
  // animation on the podium blocks replays (they key off this via [attr.data-run]
  // rather than *ngIf alone, since switching between two already-populated
  // categories should also replay the entrance, not just first mount).
  animationRun = 0;

  // Computed once (in refreshPodiumItems, below) rather than as a template
  // getter - a getter re-evaluated on every change-detection pass returns a
  // brand-new array/objects each time even when nothing actually changed,
  // and since each image's own (load) event itself triggers change
  // detection, that fed a loop: new objects -> *ngFor tears down and
  // rebuilds the <img> nodes -> images reload -> (load) fires again -> repeat.
  // That's what the constant reloading/stutter was.
  podiumItems: { rank: 1 | 2 | 3; item: TopThreeItem }[] = [];

  constructor(
    private topThreeService: TopThreeService,
    private router: Router,
    private modal: NgbModal,
    private appLoaderService: AppLoaderService
  ) {}

  ngOnInit(): void {
    this.load();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['profileUserId'] && !changes['profileUserId'].firstChange) {
      this.load();
    }
  }

  private load(): void {
    this.isLoading = true;
    this.isPrivate = false;
    this.data = null;

    const request$ = this.isOwnProfile
      ? this.topThreeService.getMyTopThree()
      : this.topThreeService.getUserTopThree(this.profileUserId);

    // This component mounts (and starts fetching) the instant the app's
    // full-screen boot loader *starts* fading out, well before it's
    // actually gone (they crossfade - see app.component.html). Waiting on
    // AppLoaderService instead of just a fixed delay from our own mount
    // means the populated podium - and its rise-in/crown-pop/glow-in
    // entrance animation - only appears REVEAL_DELAY_AFTER_LOADER_MS after
    // the loader has genuinely finished, not while still hidden underneath
    // it. Once the loader has already gone (the common case for any load()
    // after the very first), this resolves immediately.
    combineLatest([request$, this.revealGate$()]).subscribe({
      next: ([response]) => {
        this.isLoading = false;
        if (!response.isPublic && !this.isOwnProfile) {
          this.isPrivate = true;
          return;
        }
        this.data = response as TopThreeResponse;
        this.pickInitialGroupAndCategory();
      },
      error: () => {
        this.isLoading = false;
        this.isPrivate = true;
      },
    });
  }

  private revealGate$(): Observable<number> {
    return this.appLoaderService.loaderGone$.pipe(
      take(1),
      switchMap((loaderGoneAt) => timer(Math.max(0, REVEAL_DELAY_AFTER_LOADER_MS - (Date.now() - loaderGoneAt))))
    );
  }

  private categoryState(category: TopThreeCategory) {
    return this.data?.[category] ?? { manualOverride: false, items: [] };
  }

  isCategoryPopulated(category: TopThreeCategory): boolean {
    return this.categoryState(category).items.length >= REQUIRED_ITEM_COUNT;
  }

  private groupHasAnyPopulated(group: TopThreeGroup): boolean {
    return GROUP_CATEGORIES[group].some((category) => this.isCategoryPopulated(category));
  }

  // Only hides a top-level pill once the OTHER side has real content and
  // this side has none at all - with nothing set up anywhere yet, both stay
  // visible so a first-time visitor can pick where to start.
  get showCinemaPill(): boolean {
    return this.groupHasAnyPopulated('cinema') || !this.groupHasAnyPopulated('music');
  }

  get showMusicPill(): boolean {
    return this.groupHasAnyPopulated('music') || !this.groupHasAnyPopulated('cinema');
  }

  private pickInitialGroupAndCategory(): void {
    const preferredGroup: TopThreeGroup = this.groupHasAnyPopulated('cinema')
      ? 'cinema'
      : this.groupHasAnyPopulated('music')
      ? 'music'
      : 'cinema';
    this.activeGroup = preferredGroup;

    const populatedInGroup = GROUP_CATEGORIES[preferredGroup].find((category) => this.isCategoryPopulated(category));
    this.activeCategory = populatedInGroup ?? GROUP_CATEGORIES[preferredGroup][0];
    this.refreshPodiumItems();
    this.animationRun++;
  }

  selectGroup(group: TopThreeGroup): void {
    this.isCategoryMenuOpen = false;
    if (this.activeGroup === group) return;
    this.activeGroup = group;
    this.activeCategory = GROUP_CATEGORIES[group].find((category) => this.isCategoryPopulated(category)) ?? GROUP_CATEGORIES[group][0];
    this.refreshPodiumItems();
    this.animationRun++;
  }

  selectCategory(category: TopThreeCategory): void {
    this.isCategoryMenuOpen = false;
    if (this.activeCategory === category) return;
    this.activeCategory = category;
    this.refreshPodiumItems();
    this.animationRun++;
  }

  // Ordered left-to-right for display: #2, #1 (center, tallest), #3.
  private refreshPodiumItems(): void {
    const items = this.categoryState(this.activeCategory).items;
    const [first, second, third] = items;
    this.podiumItems = [
      { rank: 2 as const, item: second },
      { rank: 1 as const, item: first },
      { rank: 3 as const, item: third },
    ].filter((entry): entry is { rank: 1 | 2 | 3; item: TopThreeItem } => !!entry.item);
  }

  // Same circumference (2 * PI * r=18) and fill math as review-page's ring.
  ratingDashOffset(value: number | null | undefined): number {
    const clamped = Math.min(Math.max(value || 0, 0), 10);
    return 113.1 - (clamped / 10) * 113.1;
  }

  get subCategories(): TopThreeCategory[] {
    return GROUP_CATEGORIES[this.activeGroup];
  }

  get categoryLabel(): string {
    return CATEGORY_LABELS[this.activeCategory];
  }

  get isActivePopulated(): boolean {
    return this.isCategoryPopulated(this.activeCategory);
  }

  // Movie/show posters are naturally taller than square album art/artist
  // photos - the podium photo box's aspect ratio follows the category
  // instead of forcing every cover into the same square crop.
  get isCinemaCategory(): boolean {
    return this.activeCategory === 'movies' || this.activeCategory === 'shows';
  }

  // Keys the *ngFor wrapping the podium/empty-state block so switching
  // category or group destroys and recreates that DOM, replaying the rise-in
  // CSS animation each time instead of only on first mount.
  trackByRun(_index: number, run: number): number {
    return run;
  }

  trackByItemId(_index: number, entry: { rank: 1 | 2 | 3; item: TopThreeItem }): string {
    return entry.item.id;
  }

  // Movies/shows open the cinema detail page; songs/albums/artists open the
  // music review page - same modals/records the notifications page builds
  // when opening a bare id/title/cover from a push notification, since a
  // podium item is the same kind of "minimal record, not a full search
  // result" situation.
  onPodiumItemClick(item: TopThreeItem): void {
    if (this.isCinemaCategory) {
      this.openCinemaItem(item);
    } else {
      this.openMusicItem(item);
    }
  }

  private openMusicItem(item: TopThreeItem): void {
    const modalOptions: NgbModalOptions = { backdrop: 'static', keyboard: true, centered: true, scrollable: false };
    let record: any;

    if (this.activeCategory === 'songs') {
      record = {
        id: Number(item.id),
        type: 'Song',
        title: item.title,
        artist: item.subtitle || '',
        album: '',
        cover: item.cover,
        preview: '',
        isExplicit: false,
        genre: '',
        releaseDate: '',
        contributors: [],
        duration: 0,
        isPlaying: false,
      };
    } else if (this.activeCategory === 'albums') {
      record = {
        id: Number(item.id),
        type: 'Album',
        title: item.title,
        artist: item.subtitle || '',
        cover: item.cover,
        releaseDate: '',
        tracklist: [],
        genre: '',
        isExplicit: false,
        preview: '',
      };
    } else {
      record = { id: Number(item.id), type: 'Artist', name: item.title, picture: item.cover, tracklist: [], preview: '' };
    }

    const modalRef = this.modal.open(ReviewPageComponent, modalOptions);
    modalRef.componentInstance.record = record;
    modalRef.componentInstance.recordList = [record];
    modalRef.componentInstance.currentIndex = 0;
  }

  private openCinemaItem(item: TopThreeItem): void {
    const modalOptions: NgbModalOptions = {
      backdrop: 'static',
      keyboard: true,
      centered: true,
      scrollable: false,
      windowClass: 'cinema-detail-modal',
    };

    const record: CinemaItem = {
      type: 'Cinema',
      _id: '',
      user: '',
      mediaType: this.activeCategory === 'movies' ? 'movie' : 'tv',
      tmdbId: item.id,
      title: item.title,
      cover: item.cover,
      isWatchlist: false,
      isWatched: false,
      isUnrefinedImport: false,
      traktSynced: false,
      createdAt: new Date().toISOString(),
    };

    const modalRef = this.modal.open(CinemaReviewModalComponent, modalOptions);
    modalRef.componentInstance.record = record;
    modalRef.componentInstance.recordList = [record];
    modalRef.componentInstance.currentIndex = 0;

    // Without this, clicking "Rate"/"Edit Review" inside the detail modal
    // emits `rate` to nobody - every other opener of this same modal
    // (main-search, calendar-page, other-profile-page) subscribes to it to
    // open the actual rate/edit modal; this one just never did.
    modalRef.componentInstance.rate.subscribe((updatedRecord: CinemaItem) => {
      this.openCinemaRatingModal(updatedRecord, modalRef);
    });
  }

  // Shared cinema rate/edit-review modal (movies + shows) - mirrors
  // other-profile-page.component.ts's openCinemaRatingModal, minus the
  // watchlist-grid/cinemaReviews-list bookkeeping that only applies there -
  // the podium has no such lists to keep in sync.
  private openCinemaRatingModal(record: CinemaItem, detailsModalRef: NgbModalRef): NgbModalRef {
    const modalOptions: NgbModalOptions = {
      backdrop: 'static',
      keyboard: true,
      centered: true,
      scrollable: false,
      // Reuses the cinema detail modal's own slide-in-from-right/slide-out-
      // to-right CSS (styles.css) so opening/closing Rate feels like the
      // same "push deeper"/"pop back" navigation as the detail page's own
      // sub-views, instead of the disabled-by-default instant appear.
      windowClass: 'cinema-detail-modal',
    };

    const modalRef = this.modal.open(CinemaRateModalComponent, modalOptions);
    const instance = modalRef.componentInstance;
    instance.mode = 'cinema';
    instance.tmdbId = record.tmdbId ?? '';
    instance.mediaType = record.mediaType;
    instance.itemTitle = record.title;
    instance.cover = record.cover ?? null;
    instance.releaseDate = record.releaseDate ?? null;
    instance.displayTitle = record.title;
    instance.displayYear =
      record.mediaType === 'tv' ? record.releaseYearRange ?? null : record.releaseDate ? new Date(record.releaseDate).getFullYear() : null;
    instance.typeLabel = record.mediaType === 'movie' ? 'Movie' : 'TV Show';
    instance.genres = record.genres ?? [];
    instance.initialRating = record.decimalRating ?? null;
    instance.initialReviewText = record.reviewText ?? '';
    instance.initialContainsSpoilers = record.containsSpoilers ?? false;

    modalRef.result.then(
      (result) => {
        if (!result) return;
        detailsModalRef.componentInstance.refreshAfterRating();
      },
      () => {}
    );

    return modalRef;
  }

  goToManage(): void {
    const queryParams: { category: TopThreeCategory; userId?: string } = { category: this.activeCategory };
    // Viewing someone else's podium - the manage page renders read-only
    // (no add/edit/settings) once it sees a userId that isn't your own.
    if (!this.isOwnProfile) queryParams.userId = this.profileUserId;
    this.router.navigate(['/top-three'], { queryParams });
  }
}
