import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { CinemaReviewPageComponent } from './cinema-review-page.component';
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
  imports: [CommonModule, CinemaReviewPageComponent],
  template: `
    <div class="fixed inset-0 z-50 overflow-y-auto bg-[#020814]">
      <div class="cinema-loader-overlay" *ngIf="!detail">
        <div class="cinema-loader-ring"></div>
        <p class="cinema-loader-text">Loading details…</p>
      </div>

      <app-cinema-review-page
        *ngIf="detail"
        [title]="detail.title"
        [cover]="detail.cover"
        [year]="detail.year"
        [runtimeMinutes]="detail.runtimeMinutes"
        [certification]="detail.certification"
        [releaseDate]="detail.releaseDate"
        [genres]="detail.genres"
        [imdbRating]="detail.imdbRating"
        [imdbVoteCount]="detail.imdbVoteCount"
        [description]="detail.description"
        [director]="detail.director"
        [awardsSummary]="detail.awardsSummary"
        [boxOffice]="detail.boxOffice"
        [watchProviders]="detail.watchProviders"
        [isWatchlist]="isWatchlist"
        (back)="activeModal.dismiss()"
        (addToWatchlist)="onAddToWatchlist()"
        (rate)="rate.emit()"
      ></app-cinema-review-page>
    </div>
  `,
})
export class CinemaReviewModalComponent implements OnInit {
  @Input() record!: CinemaItem;
  @Input() recordList: CinemaItem[] = [];
  @Input() currentIndex = 0;

  @Output() watchlistToggled = new EventEmitter<CinemaItem>();
  @Output() rate = new EventEmitter<void>();

  detail: CinemaDetail | null = null;
  isWatchlist = false;
  isTogglingWatchlist = false;

  constructor(
    public activeModal: NgbActiveModal,
    private cinemaService: CinemaService,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    this.isWatchlist = this.record.isWatchlist;

    this.cinemaService.getCinemaDetail(this.record.mediaType, this.record.tmdbId!).subscribe({
      next: (res) => (this.detail = res.data),
      error: () => this.toastr.error('Failed to load details.', 'Error'),
    });
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
}
