import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { NgbActiveModal, NgbModal, NgbModalOptions } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { CinemaReviewPageComponent, ReviewFilter, ReviewSort } from './cinema-review-page.component';
import { CinemaCastListComponent } from './cinema-cast-list.component';
import { CinemaAllReviewsComponent } from './cinema-all-reviews.component';
import { CinemaService } from '../../services/cinema.service';
import { ReviewService } from '../../services/review.service';
import { UserService } from '../../services/user.service';
import { CinemaDetail, CinemaItem, CinemaPersonCredit, CinemaReview } from '../../models/responses/cinema-response';

// Modal wrapper around the presentational CinemaReviewPageComponent - fetches
// the full detail payload (TMDb + OMDb) for the given record and exposes the
// same `watchlistToggled` event the old ReviewPageComponent modal did, so
// callers barely have to change. Rating/review editing still delegates to
// the legacy modal via `rate` until this page grows its own rating UI.
@Component({
  selector: 'app-cinema-review-modal',
  standalone: true,
  imports: [CommonModule, CinemaReviewPageComponent, CinemaCastListComponent, CinemaAllReviewsComponent],
  template: `
    <div #scrollContainer class="fixed inset-0 z-50 overflow-y-auto bg-[#020814]">
      <div class="cinema-loader-overlay" *ngIf="!detail">
        <div class="cinema-loader-ring"></div>
        <p class="cinema-loader-text">Loading details…</p>
      </div>

      <app-cinema-review-page
        *ngIf="detail && !showFullCast && !showAllReviews"
        [title]="detail.title"
        [cover]="detail.cover"
        [mediaType]="detail.mediaType"
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
        [genres]="detail.genres"
        [appRating]="appRating"
        [appReviewCount]="appReviewCount"
        [imdbRating]="detail.imdbRating"
        [imdbVoteCount]="detail.imdbVoteCount"
        [description]="detail.description"
        [director]="detail.director"
        [awardsSummary]="detail.awardsSummary"
        [boxOffice]="detail.boxOffice"
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
        (rate)="rate.emit()"
        (markWatched)="onMarkWatched()"
        (viewCast)="switchToCast()"
        (reviewFilterChange)="reviewFilter = $event"
        (reviewSortChange)="onReviewSortChange($event)"
        (toggleReviewLike)="onToggleReviewLike($event)"
        (seeAllReviews)="switchToAllReviews()"
        (similarItemClick)="openRelatedTitle($event)"
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
        [currentUserId]="currentUserId"
        [reviewFilter]="reviewFilter"
        [reviewSort]="reviewSort"
        (back)="switchToReview()"
        (reviewFilterChange)="reviewFilter = $event"
        (reviewSortChange)="onReviewSortChange($event)"
        (toggleReviewLike)="onToggleReviewLike($event)"
      ></app-cinema-all-reviews>
    </div>
  `,
})
export class CinemaReviewModalComponent implements OnInit {
  @ViewChild('scrollContainer') scrollContainer!: ElementRef<HTMLDivElement>;

  @Input() record!: CinemaItem;
  @Input() recordList: CinemaItem[] = [];
  @Input() currentIndex = 0;

  @Output() watchlistToggled = new EventEmitter<CinemaItem>();
  @Output() rate = new EventEmitter<void>();

  detail: CinemaDetail | null = null;
  isWatchlist = false;
  isWatched = false;
  isTogglingWatchlist = false;
  isTogglingWatched = false;
  showFullCast = false;
  showAllReviews = false;

  reviews: CinemaReview[] = [];
  userReview: CinemaReview | null = null;
  currentUserId: string | null = null;
  reviewFilter: ReviewFilter = 'all';
  reviewSort: ReviewSort = 'recent';
  appRating: number | null = null;
  appReviewCount: number | null = null;

  constructor(
    public activeModal: NgbActiveModal,
    private modal: NgbModal,
    private cinemaService: CinemaService,
    private reviewService: ReviewService,
    private userService: UserService,
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

  private loadReviews(): void {
    this.cinemaService.getCinemaReviews(this.record, this.reviewSort).subscribe({
      next: ({ data }) => {
        this.reviews = data.reviews;
        this.userReview = data.userReview;
        this.appReviewCount = data.reviews.length;
        this.appRating = data.reviews.length
          ? data.reviews.reduce((sum, r) => sum + (r.decimalRating || 0), 0) / data.reviews.length
          : null;
      },
      error: () => this.toastr.error('Failed to load reviews.', 'Error'),
    });
  }

  onReviewSortChange(sort: ReviewSort): void {
    this.reviewSort = sort;
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

  switchToCast(): void {
    this.showFullCast = true;
    this.resetScroll();
  }

  switchToAllReviews(): void {
    this.showAllReviews = true;
    this.resetScroll();
  }

  switchToReview(): void {
    this.showFullCast = false;
    this.showAllReviews = false;
    this.resetScroll();
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
