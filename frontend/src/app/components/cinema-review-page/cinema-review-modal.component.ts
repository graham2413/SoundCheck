import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { trigger, transition, style, animate, query, group } from '@angular/animations';
import { NgbActiveModal, NgbModal, NgbModalOptions } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { CinemaReviewPageComponent, ReviewFilter, ReviewSort } from './cinema-review-page.component';
import { CinemaCastListComponent } from './cinema-cast-list.component';
import { CinemaAllReviewsComponent } from './cinema-all-reviews.component';
import { CinemaAwardsPageComponent } from './cinema-awards-page.component';
import { CinemaEpisodeDetailComponent } from './cinema-episode-detail.component';
import { CinemaSoundtrackListComponent } from './cinema-soundtrack-list.component';
import { ReviewPageComponent } from '../review-page/review-page.component';
import { CinemaService } from '../../services/cinema.service';
import { ReviewService } from '../../services/review.service';
import { UserService } from '../../services/user.service';
import { SearchService } from '../../services/search.service';
import { CinemaDetail, CinemaItem, CinemaPersonCredit, CinemaReview, CinemaSeasonEpisode, CinemaSoundtrackTrack, EpisodeImdbRating } from '../../models/responses/cinema-response';

// Modal wrapper around the presentational CinemaReviewPageComponent - fetches
// the full detail payload (TMDb + OMDb) for the given record and exposes the
// same `watchlistToggled` event the old ReviewPageComponent modal did, so
// callers barely have to change. Rating/review editing still delegates to
// the legacy modal via `rate` until this page grows its own rating UI.
@Component({
  selector: 'app-cinema-review-modal',
  standalone: true,
  imports: [CommonModule, CinemaReviewPageComponent, CinemaCastListComponent, CinemaAllReviewsComponent, CinemaAwardsPageComponent, CinemaEpisodeDetailComponent, CinemaSoundtrackListComponent],
  animations: [
    // Same push-forward/pop-back feel as this modal's own slide-in-from-
    // right entrance (see the .cinema-detail-modal rule in styles.css) -
    // opening a sub-view (Cast/All Reviews/Awards/Episode/Soundtrack) slides
    // it in from the right while the overview slides out to the left;
    // going back (any sub-view -> overview) reverses both directions. Every
    // sub-view's own `back` always returns straight to "overview" (never
    // sub-view -> sub-view directly), so these two transitions cover every
    // real case.
    trigger('panelSlide', [
      transition('overview => *', [
        query(':enter', [style({ transform: 'translateX(100%)' })], { optional: true }),
        query(':leave', [style({ position: 'absolute', top: 0, left: 0, width: '100%' })], { optional: true }),
        group([
          query(':enter', [animate('300ms ease-out', style({ transform: 'translateX(0)' }))], { optional: true }),
          query(':leave', [animate('300ms ease-out', style({ transform: 'translateX(-100%)' }))], { optional: true }),
        ]),
      ]),
      transition('* => overview', [
        query(':enter', [style({ transform: 'translateX(-100%)' })], { optional: true }),
        query(':leave', [style({ position: 'absolute', top: 0, left: 0, width: '100%' })], { optional: true }),
        group([
          query(':enter', [animate('300ms ease-out', style({ transform: 'translateX(0)' }))], { optional: true }),
          query(':leave', [animate('300ms ease-out', style({ transform: 'translateX(100%)' }))], { optional: true }),
        ]),
      ]),
    ]),
  ],
  template: `
    <div #scrollContainer class="fixed inset-0 z-50 overflow-y-auto bg-[#020814]">
      <div class="cinema-loader-overlay" *ngIf="!detail">
        <div class="cinema-loader-ring"></div>
        <p class="cinema-loader-text">Loading details…</p>
      </div>

      <div [@panelSlide]="currentPanel" style="position: relative; overflow: hidden;">

      <app-cinema-review-page
        *ngIf="detail && !showFullCast && !showAllReviews && !showAwards && !showEpisodeDetail && !showSoundtrack"
        [title]="detail.title"
        [cover]="detail.cover"
        [mediaType]="detail.mediaType"
        [tmdbId]="detail.tmdbId"
        [imdbId]="detail.imdbId"
        [year]="detail.year"
        [releaseYearRange]="detail.releaseYearRange"
        [runtimeMinutes]="detail.runtimeMinutes"
        [certification]="detail.certification"
        [releaseDate]="detail.releaseDate"
        [rereleaseDate]="detail.rereleaseDate"
        [hadTheatricalRelease]="detail.hadTheatricalRelease"
        [digitalReleaseDate]="detail.digitalReleaseDate"
        [status]="detail.status"
        [lastEpisodeAirDate]="detail.lastEpisodeAirDate"
        [nextEpisodeAirDate]="detail.nextEpisodeAirDate"
        [nextEpisodeNumber]="detail.nextEpisodeNumber"
        [numberOfSeasons]="detail.numberOfSeasons"
        [genres]="detail.genres"
        [appRating]="appRating"
        [appReviewCount]="appReviewCount"
        [imdbRating]="detail.imdbRating"
        [imdbVoteCount]="detail.imdbVoteCount"
        [description]="detail.description"
        [director]="detail.director"
        [awardsSummary]="detail.awardsSummary"
        [boxOffice]="detail.boxOffice"
        [budget]="detail.budget"
        [watchProviders]="detail.watchProviders"
        [images]="detail.images"
        [trailerKey]="detail.trailerKey"
        [similar]="detail.similar"
        [isWatchlist]="isWatchlist"
        [isWatched]="isWatched"
        [isTogglingWatchlist]="isTogglingWatchlist"
        [isTogglingWatched]="isTogglingWatched"
        [reviews]="reviews"
        [userReview]="userReview"
        [currentUserId]="currentUserId"
        [reviewFilter]="reviewFilter"
        [reviewSort]="reviewSort"
        (back)="activeModal.dismiss()"
        (addToWatchlist)="onAddToWatchlist()"
        (rate)="rate.emit(record)"
        (markWatched)="onMarkWatched()"
        (viewCast)="switchToCast()"
        (viewAwards)="switchToAwards()"
        (viewSoundtrack)="switchToSoundtrack()"
        (reviewFilterChange)="reviewFilter = $event"
        (reviewSortChange)="onReviewSortChange($event)"
        (toggleReviewLike)="onToggleReviewLike($event)"
        (seeAllReviews)="switchToAllReviews()"
        (similarItemClick)="openRelatedTitle($event)"
        (episodeSelected)="onEpisodeSelected($event)"
      ></app-cinema-review-page>

      <app-cinema-cast-list
        *ngIf="detail && showFullCast"
        [cast]="detail.cast"
        (back)="switchToReview()"
        (creditClick)="openRelatedTitle($event)"
      ></app-cinema-cast-list>

      <app-cinema-all-reviews
        *ngIf="detail && showAllReviews"
        [title]="detail.title"
        [cover]="detail.cover"
        [appRating]="appRating"
        [appReviewCount]="appReviewCount"
        [reviews]="reviews"
        [userReview]="userReview"
        [currentUserId]="currentUserId"
        [reviewFilter]="reviewFilter"
        [reviewSort]="reviewSort"
        [hasMoreReviews]="hasMoreReviews"
        [isLoadingMoreReviews]="isLoadingMoreReviews"
        (back)="switchToReview()"
        (reviewFilterChange)="reviewFilter = $event"
        (reviewSortChange)="onReviewSortChange($event)"
        (toggleReviewLike)="onToggleReviewLike($event)"
        (loadMoreReviews)="loadMoreReviews()"
      ></app-cinema-all-reviews>

      <app-cinema-awards-page
        *ngIf="detail && showAwards"
        [title]="detail.title"
        [cover]="detail.cover"
        [mediaType]="detail.mediaType"
        [year]="detail.year"
        [releaseYearRange]="detail.releaseYearRange"
        [runtimeMinutes]="detail.runtimeMinutes"
        [certification]="detail.certification"
        [genres]="detail.genres"
        [awardsRaw]="detail.awardsRaw"
        [awardsStats]="detail.awardsStats"
        (back)="switchToReview()"
      ></app-cinema-awards-page>

      <app-cinema-episode-detail
        *ngIf="detail && showEpisodeDetail && selectedEpisode"
        [tmdbId]="detail.tmdbId"
        [showTitle]="detail.title"
        [showCover]="detail.cover"
        [seasonNumber]="selectedEpisodeSeasonNumber"
        [episode]="selectedEpisode"
        [seasonPosterUrl]="selectedEpisodeSeasonPosterUrl"
        [imdbRating]="selectedEpisodeImdbRating"
        (back)="switchToReview()"
        (episodeUpdated)="onEpisodeUpdated($event)"
      ></app-cinema-episode-detail>

      <app-cinema-soundtrack-list
        *ngIf="detail && showSoundtrack"
        [title]="detail.title"
        [cover]="detail.cover"
        [tracks]="soundtrackTracks || []"
        [isLoading]="isLoadingSoundtrack"
        [source]="soundtrackSource"
        [playlistUrl]="soundtrackPlaylistUrl"
        [resolvingTrackIndex]="resolvingSoundtrackTrackIndex"
        (back)="switchToReview()"
        (trackClick)="onSoundtrackTrackClick($event)"
      ></app-cinema-soundtrack-list>

      </div>
    </div>
  `,
})
export class CinemaReviewModalComponent implements OnInit {
  @ViewChild('scrollContainer') scrollContainer!: ElementRef<HTMLDivElement>;

  @Input() record!: CinemaItem;
  @Input() recordList: CinemaItem[] = [];
  @Input() currentIndex = 0;

  @Output() watchlistToggled = new EventEmitter<CinemaItem>();
  // Emits the modal's own up-to-date record (merged with the current
  // user's real reviewText/containsSpoilers once reviews load - see
  // loadReviews()) instead of void, so whoever opens the rate modal always
  // gets accurate pre-fill data instead of a possibly-stale closured copy.
  @Output() rate = new EventEmitter<CinemaItem>();

  detail: CinemaDetail | null = null;
  isWatchlist = false;
  isWatched = false;
  isTogglingWatchlist = false;
  isTogglingWatched = false;
  showFullCast = false;
  showAllReviews = false;
  showAwards = false;
  showEpisodeDetail = false;
  showSoundtrack = false;
  // null = not yet fetched (lazy - only fetched the first time the user
  // actually opens the Soundtrack tab), [] = fetched, nothing available.
  soundtrackTracks: CinemaSoundtrackTrack[] | null = null;
  soundtrackSource: 'soundtrackdb' | 'musicbrainz' | null = null;
  soundtrackPlaylistUrl: string | null = null;
  isLoadingSoundtrack = false;
  // Index of the one soundtrack row currently being resolved to a Deezer
  // track (null = none in flight) - only one at a time, on tap.
  resolvingSoundtrackTrackIndex: number | null = null;
  selectedEpisode: CinemaSeasonEpisode | null = null;
  selectedEpisodeSeasonNumber = 1;
  selectedEpisodeSeasonPosterUrl: string | null = null;
  selectedEpisodeImdbRating: EpisodeImdbRating | null = null;

  reviews: CinemaReview[] = [];
  userReview: CinemaReview | null = null;
  currentUserId: string | null = null;
  reviewFilter: ReviewFilter = 'all';
  reviewSort: ReviewSort = 'recent';
  appRating: number | null = null;
  appReviewCount: number | null = null;

  // Reviews are fetched a page at a time (mirrors calendar-page's
  // offset/limit + hasMore pattern) - more are grabbed as the user scrolls
  // the "See All Reviews" list rather than fetching every review up front.
  private static readonly REVIEWS_PAGE_SIZE = 20;
  hasMoreReviews = true;
  isLoadingMoreReviews = false;

  constructor(
    public activeModal: NgbActiveModal,
    private modal: NgbModal,
    private cinemaService: CinemaService,
    private reviewService: ReviewService,
    private userService: UserService,
    private searchService: SearchService,
    private toastr: ToastrService
  ) {}

  // Opens a title clicked from "Similar" or an actor's filmography as a new,
  // stacked modal instance (ng-bootstrap supports this natively) - untracked
  // stub record, same as a fresh search result, since there's no CinemaItem
  // for it yet until the user actually tracks it.
  openRelatedTitle(item: CinemaPersonCredit): void {
    const record: CinemaItem = {
      type: 'Cinema',
      _id: '',
      user: '',
      mediaType: item.mediaType,
      tmdbId: item.tmdbId,
      title: item.title,
      cover: item.cover ?? undefined,
      releaseDate: item.releaseDate ?? undefined,
      isWatchlist: false,
      isWatched: false,
      isUnrefinedImport: false,
      traktSynced: false,
      createdAt: new Date().toISOString(),
    };

    const modalOptions: NgbModalOptions = {
      backdrop: 'static',
      keyboard: true,
      centered: true,
      scrollable: false,
      windowClass: 'cinema-detail-modal',
    };
    const modalRef = this.modal.open(CinemaReviewModalComponent, modalOptions);
    modalRef.componentInstance.record = record;
  }

  ngOnInit(): void {
    this.isWatchlist = this.record.isWatchlist;
    this.isWatched = this.record.isWatched;

    this.userService.userProfile$.subscribe((profile) => {
      this.currentUserId = profile?._id ?? null;
    });

    // Search results are untracked stubs (no real CinemaItem _id) that
    // always assume isWatchlist/isWatched false - if the user already has
    // this exact title tracked, look up the real state so the buttons don't
    // wrongly show "Add to Watchlist" for something already tracked.
    if (!this.record._id) {
      this.cinemaService.getCinemaItemStatus(this.record.mediaType, this.record.tmdbId!).subscribe({
        next: ({ data }) => {
          if (!data) return;
          this.isWatchlist = data.isWatchlist;
          this.isWatched = data.isWatched;
          this.record = { ...this.record, ...data };
        },
      });
    }

    this.cinemaService.getCinemaDetail(this.record.mediaType, this.record.tmdbId!).subscribe({
      next: (res) => (this.detail = res.data),
      error: () => this.toastr.error('Failed to load details.', 'Error'),
    });

    this.loadReviews();
  }

  // Initial load (and reload on sort change) - replaces the list from page 0.
  private loadReviews(): void {
    this.hasMoreReviews = true;
    this.isLoadingMoreReviews = false;

    this.cinemaService.getCinemaReviews(this.record, this.reviewSort, 0, CinemaReviewModalComponent.REVIEWS_PAGE_SIZE).subscribe({
      next: ({ data }) => {
        this.reviews = data.reviews;
        this.userReview = data.userReview;
        this.appReviewCount = data.totalCount;
        this.appRating = data.avgRating;
        this.hasMoreReviews = data.hasMore;

        // The record this modal was opened with can be a stale/incomplete
        // copy (e.g. a search-result stub, or a list item fetched before the
        // user's own rating/review text existed) - the freshly-fetched
        // userReview is always accurate for the CURRENT user, so merge its
        // fields in as the source of truth for anything the "Rate"/"Edit"
        // buttons hand off to the rate modal.
        if (this.userReview) {
          this.record = {
            ...this.record,
            _id: this.userReview._id,
            decimalRating: this.userReview.decimalRating,
            reviewText: this.userReview.reviewText,
            containsSpoilers: this.userReview.containsSpoilers,
            isWatched: true,
            isWatchlist: false,
          };
        }
      },
      error: () => this.toastr.error('Failed to load reviews.', 'Error'),
    });
  }

  // Fired by infiniteScroll on the "See All Reviews" list - appends the next
  // page instead of replacing reviews, so scroll position isn't disturbed.
  loadMoreReviews(): void {
    if (this.isLoadingMoreReviews || !this.hasMoreReviews) return;
    this.isLoadingMoreReviews = true;

    this.cinemaService
      .getCinemaReviews(this.record, this.reviewSort, this.reviews.length, CinemaReviewModalComponent.REVIEWS_PAGE_SIZE)
      .subscribe({
        next: ({ data }) => {
          this.reviews = [...this.reviews, ...data.reviews];
          this.appReviewCount = data.totalCount;
          this.appRating = data.avgRating;
          this.hasMoreReviews = data.hasMore;
          this.isLoadingMoreReviews = false;
        },
        error: () => {
          this.toastr.error('Failed to load more reviews.', 'Error');
          this.isLoadingMoreReviews = false;
        },
      });
  }

  onReviewSortChange(sort: ReviewSort): void {
    this.reviewSort = sort;
    this.loadReviews();
  }

  // Called by whoever opened this modal, once the Rate/Edit modal (opened on
  // top of this one via `rate.emit` - see openers in main-search/calendar-page/
  // other-profile-page) resolves - so this modal reflects the new rating in
  // place instead of having been closed and needing to be reopened.
  refreshAfterRating(): void {
    this.isWatched = true;
    this.isWatchlist = false;
    this.loadReviews();
  }

  onToggleReviewLike(review: CinemaReview): void {
    this.reviewService.toggleLike(review._id, 'cinema').subscribe({
      next: ({ likes, likedByUser }) => {
        const apply = (r: CinemaReview) => {
          if (r._id !== review._id) return r;
          const likedBy = likedByUser
            ? [...(r.likedBy || []), this.currentUserId!]
            : (r.likedBy || []).filter((id) => id !== this.currentUserId);
          return { ...r, likes, likedBy };
        };
        this.reviews = this.reviews.map(apply);
        if (this.userReview) this.userReview = apply(this.userReview);
      },
      error: () => this.toastr.error('Failed to update like.', 'Error'),
    });
  }

  // Review page and cast list share the same scrollable container (toggled
  // via *ngIf), so switching views without resetting scrollTop would open
  // the cast list already scrolled down if the review page had been scrolled.
  private resetScroll(): void {
    this.scrollContainer.nativeElement.scrollTop = 0;
  }

  // Drives the panelSlide animation (see @Component.animations above) - a
  // plain derived getter, same pattern app.component.ts's own
  // [@routeAnimations]="prepareRoute(activeOutlet)" already uses elsewhere
  // in this app, rather than a separate stored field mirroring these flags.
  get currentPanel(): string {
    if (this.showFullCast) return 'cast';
    if (this.showAllReviews) return 'allReviews';
    if (this.showAwards) return 'awards';
    if (this.showEpisodeDetail) return 'episode';
    if (this.showSoundtrack) return 'soundtrack';
    return 'overview';
  }

  switchToCast(): void {
    this.showFullCast = true;
    this.resetScroll();
  }

  switchToAllReviews(): void {
    this.showAllReviews = true;
    this.resetScroll();
  }

  switchToAwards(): void {
    this.showAwards = true;
    this.resetScroll();
  }

  switchToReview(): void {
    this.showFullCast = false;
    this.showAllReviews = false;
    this.showAwards = false;
    this.showEpisodeDetail = false;
    this.showSoundtrack = false;
    this.resetScroll();
  }

  // Lazy - only actually calls the backend the first time this tab is
  // opened (soundtrackTracks stays populated afterward, so flipping tabs
  // back and forth doesn't re-fetch). Series-level only for TV; imdbId is
  // whatever getCinemaDetail already resolved for this title.
  switchToSoundtrack(): void {
    this.showSoundtrack = true;
    this.resetScroll();

    if (this.soundtrackTracks !== null) return; // already fetched this session
    if (!this.detail?.imdbId) {
      this.soundtrackTracks = [];
      return;
    }

    this.isLoadingSoundtrack = true;
    this.cinemaService
      .getSoundtrack(this.detail.imdbId, {
        title: this.detail.title,
        year: this.detail.year,
        mediaType: this.detail.mediaType,
        releaseDate: this.detail.releaseDate,
      })
      .subscribe({
        next: ({ data }) => {
          this.soundtrackTracks = data.tracks;
          this.soundtrackSource = data.source;
          this.soundtrackPlaylistUrl = data.playlistUrl;
          this.isLoadingSoundtrack = false;
        },
        error: () => {
          this.soundtrackTracks = [];
          this.isLoadingSoundtrack = false;
          this.toastr.error('Failed to load soundtrack.', 'Error');
        },
      });
  }

  // The one place this whole feature calls Deezer - resolves a single
  // title+artist to a real track ONLY on tap, never for the whole list, then
  // opens the existing song review modal exactly like main-search/other-
  // profile-page already do for any other song.
  onSoundtrackTrackClick(payload: { track: CinemaSoundtrackTrack; index: number }): void {
    this.resolvingSoundtrackTrackIndex = payload.index;

    this.searchService.resolveTrack(payload.track.title, payload.track.artist ?? undefined).subscribe({
      next: (song) => {
        this.resolvingSoundtrackTrackIndex = null;

        const modalOptions: NgbModalOptions = {
          backdrop: 'static',
          keyboard: true,
          centered: true,
          scrollable: false,
        };
        const modalRef = this.modal.open(ReviewPageComponent, modalOptions);
        modalRef.componentInstance.record = song;
      },
      error: () => {
        this.resolvingSoundtrackTrackIndex = null;
        this.toastr.error("Couldn't find this track on Deezer.", 'Not Found');
      },
    });
  }

  onEpisodeSelected(payload: {
    episode: CinemaSeasonEpisode;
    seasonNumber: number;
    seasonPosterUrl: string | null;
    imdbRating: EpisodeImdbRating | null;
  }): void {
    this.selectedEpisode = payload.episode;
    this.selectedEpisodeSeasonNumber = payload.seasonNumber;
    this.selectedEpisodeSeasonPosterUrl = payload.seasonPosterUrl;
    this.selectedEpisodeImdbRating = payload.imdbRating;
    this.showEpisodeDetail = true;
    this.resetScroll();
  }

  onEpisodeUpdated(episode: CinemaSeasonEpisode): void {
    this.selectedEpisode = episode;
  }

  onAddToWatchlist(): void {
    if (this.isTogglingWatchlist) return;
    this.isTogglingWatchlist = true;

    this.cinemaService
      .toggleWatchlist({
        tmdbId: this.record.tmdbId!,
        mediaType: this.record.mediaType,
        title: this.detail?.title ?? this.record.title,
        cover: this.detail?.cover ?? this.record.cover,
        releaseDate: this.detail?.releaseDate ?? this.record.releaseDate,
      })
      .subscribe({
        next: ({ data }) => {
          this.isWatchlist = data.isWatchlist;
          this.record = {
            ...this.record,
            isWatchlist: data.isWatchlist,
            _id: data.item?._id ?? this.record._id,
          };
          this.isTogglingWatchlist = false;
          this.toastr.success(
            data.isWatchlist ? 'Added to watchlist.' : 'Removed from watchlist.',
            'Success'
          );
          this.watchlistToggled.emit(this.record);
        },
        error: () => {
          this.toastr.error('Error occurred while updating your watchlist.', 'Error');
          this.isTogglingWatchlist = false;
        },
      });
  }

  onMarkWatched(): void {
    if (this.isTogglingWatched) return;
    this.isTogglingWatched = true;

    this.cinemaService
      .markWatched({
        tmdbId: this.record.tmdbId!,
        mediaType: this.record.mediaType,
        title: this.detail?.title ?? this.record.title,
        cover: this.detail?.cover ?? this.record.cover,
        releaseDate: this.detail?.releaseDate ?? this.record.releaseDate,
      })
      .subscribe({
        next: ({ data }) => {
          const nowWatched = !!data?.isWatched;
          this.isWatched = nowWatched;
          this.isWatchlist = data?.isWatchlist ?? false;
          this.record = {
            ...this.record,
            isWatched: nowWatched,
            isWatchlist: this.isWatchlist,
            _id: data?._id ?? this.record._id,
          };
          this.isTogglingWatched = false;
          this.toastr.success(nowWatched ? 'Marked as watched.' : 'Removed from watched.', 'Success');
          this.watchlistToggled.emit(this.record);
        },
        error: () => {
          this.toastr.error('Error occurred while updating watched status.', 'Error');
          this.isTogglingWatched = false;
        },
      });
  }
}
