import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { CinemaReviewPageComponent } from './cinema-review-page.component';
import { CinemaCastListComponent } from './cinema-cast-list.component';
import { CinemaService } from '../../services/cinema.service';
import { CinemaDetail, CinemaItem } from '../../models/responses/cinema-response';

// Modal wrapper around the presentational CinemaReviewPageComponent - fetches
// the full detail payload (TMDb + OMDb) for the given record and exposes the
// same `watchlistToggled` event the old ReviewPageComponent modal did, so
// callers barely have to change. Rating/review editing still delegates to
// the legacy modal via `rate` until this page grows its own rating UI.
@Component({
  selector: 'app-cinema-review-modal',
  standalone: true,
  imports: [CommonModule, CinemaReviewPageComponent, CinemaCastListComponent],
  template: `
    <div #scrollContainer class="fixed inset-0 z-50 overflow-y-auto bg-[#020814]">
      <div class="cinema-loader-overlay" *ngIf="!detail">
        <div class="cinema-loader-ring"></div>
        <p class="cinema-loader-text">Loading details…</p>
      </div>

      <app-cinema-review-page
        *ngIf="detail && !showFullCast"
        [title]="detail.title"
        [cover]="detail.cover"
        [mediaType]="detail.mediaType"
        [year]="detail.year"
        [releaseYearRange]="detail.releaseYearRange"
        [runtimeMinutes]="detail.runtimeMinutes"
        [certification]="detail.certification"
        [releaseDate]="detail.releaseDate"
        [status]="detail.status"
        [lastEpisodeAirDate]="detail.lastEpisodeAirDate"
        [nextEpisodeAirDate]="detail.nextEpisodeAirDate"
        [genres]="detail.genres"
        [imdbRating]="detail.imdbRating"
        [imdbVoteCount]="detail.imdbVoteCount"
        [description]="detail.description"
        [director]="detail.director"
        [awardsSummary]="detail.awardsSummary"
        [boxOffice]="detail.boxOffice"
        [watchProviders]="detail.watchProviders"
        [isWatchlist]="isWatchlist"
        [isWatched]="isWatched"
        (back)="activeModal.dismiss()"
        (addToWatchlist)="onAddToWatchlist()"
        (rate)="rate.emit()"
        (markWatched)="onMarkWatched()"
        (viewCast)="switchToCast()"
      ></app-cinema-review-page>

      <app-cinema-cast-list
        *ngIf="detail && showFullCast"
        [cast]="detail.cast"
        (back)="switchToReview()"
      ></app-cinema-cast-list>
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
  showFullCast = false;

  constructor(
    public activeModal: NgbActiveModal,
    private cinemaService: CinemaService,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    this.isWatchlist = this.record.isWatchlist;
    this.isWatched = this.record.isWatched;

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

  switchToReview(): void {
    this.showFullCast = false;
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
          this.toastr.success(nowWatched ? 'Marked as watched.' : 'Removed from watched.', 'Success');
          this.watchlistToggled.emit(this.record);
        },
        error: () => {
          this.toastr.error('Error occurred while updating watched status.', 'Error');
        },
      });
  }
}
