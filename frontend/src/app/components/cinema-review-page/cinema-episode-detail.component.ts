import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { NgbModal, NgbModalOptions } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { CinemaService } from '../../services/cinema.service';
import { UserService } from '../../services/user.service';
import { CinemaSeasonEpisode, EpisodeImdbRating, EpisodeReviewEntry } from '../../models/responses/cinema-response';
import { CinemaRateModalComponent } from './cinema-rate-modal.component';

// Dedicated full-screen episode detail overlay (same "swap in place" pattern
// as cinema-cast-list/cinema-awards-page) - deliberately minimal per the
// user's spec: episode's own overview/air date/still image only, no cast/
// awards/trailer/where-to-watch/more-images (those stay show-level, on the
// main detail page).
@Component({
  selector: 'app-cinema-episode-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cinema-episode-detail.component.html',
  styleUrls: ['./cinema-episode-detail.component.css'],
})
export class CinemaEpisodeDetailComponent implements OnChanges {
  @Input() tmdbId: string | null = null;
  @Input() showTitle = '';
  @Input() showCover: string | null = null;
  @Input() seasonNumber = 1;
  @Input() episode!: CinemaSeasonEpisode;
  @Input() seasonPosterUrl: string | null = null;
  @Input() imdbRating: EpisodeImdbRating | null = null;

  @Output() back = new EventEmitter<void>();
  @Output() episodeUpdated = new EventEmitter<CinemaSeasonEpisode>();

  isTogglingWatched = false;

  reviews: EpisodeReviewEntry[] = [];
  loadingReviews = false;
  currentUserId: string | null = null;
  private currentUsername = '';
  private currentUserProfilePicture = '';

  private static readonly RING_RADIUS = 45;
  readonly ringCircumference = 2 * Math.PI * CinemaEpisodeDetailComponent.RING_RADIUS;

  constructor(
    private cinemaService: CinemaService,
    private modal: NgbModal,
    private toastr: ToastrService,
    private userService: UserService
  ) {
    this.userService.userProfile$.subscribe((profile) => {
      this.currentUserId = profile?._id ?? null;
      this.currentUsername = profile?.username ?? '';
      this.currentUserProfilePicture = profile?.profilePicture ?? '';
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['episode']) {
      this.isTogglingWatched = false;
    }
    // Season/episode identity change (not just an in-place myReview patch) -
    // reload this episode's community reviews.
    if (changes['tmdbId'] || changes['seasonNumber'] || (changes['episode'] && changes['episode'].previousValue?.episodeNumber !== this.episode?.episodeNumber)) {
      this.loadReviews();
    }
  }

  private loadReviews(): void {
    if (!this.tmdbId || !this.episode) return;
    this.loadingReviews = true;
    this.cinemaService.getEpisodeReviews(this.tmdbId, this.seasonNumber, this.episode.episodeNumber).subscribe({
      next: ({ data }) => {
        this.reviews = data.reviews;
        this.loadingReviews = false;
      },
      error: () => {
        this.reviews = [];
        this.loadingReviews = false;
      },
    });
  }

  // Applies a just-saved rating locally (no refetch) - insert if this is the
  // user's first review for this episode, replace in place if editing.
  private upsertMyReviewLocally(entry: EpisodeReviewEntry): void {
    const i = this.reviews.findIndex((r) => r.user._id === this.currentUserId);
    if (i !== -1) {
      this.reviews = [...this.reviews.slice(0, i), entry, ...this.reviews.slice(i + 1)];
    } else {
      this.reviews = [entry, ...this.reviews];
    }
  }

  // Same Cloudinary face-centered crop used for profile pictures everywhere else in the app.
  profilePictureUrl(url: string | null | undefined): string {
    if (!url) return 'assets/user.png';
    return url.replace('/upload/', '/upload/w_400,h_400,c_fill,g_face,f_auto,q_auto/');
  }

  // 5-star display converted from the 0-10 decimalRating, with partial fill per star.
  starFillPercent(starIndex: number, decimalRating: number): number {
    const rating5 = (decimalRating ?? 0) / 2;
    return Math.max(0, Math.min(100, (rating5 - (starIndex - 1)) * 100));
  }

  get posterUrl(): string | null {
    return this.seasonPosterUrl || this.showCover;
  }

  get isWatched(): boolean {
    return !!this.episode?.myReview?.isWatched;
  }

  get myRating(): number | null {
    return this.episode?.myReview?.decimalRating ?? null;
  }

  get formattedAirDate(): string | null {
    if (!this.episode?.airDate) return null;
    const date = new Date(this.episode.airDate);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  get formattedRuntime(): string | null {
    const minutes = this.episode?.runtime;
    if (!minutes) return null;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours && mins) return `${hours}h ${mins}m`;
    if (hours) return `${hours}h`;
    return `${mins}m`;
  }

  private ringDashoffset(value: number | null): number {
    if (value == null) return this.ringCircumference;
    const percent = Math.min(Math.max(value, 0), 10) / 10;
    return this.ringCircumference * (1 - percent);
  }

  get myRatingDashoffset(): number {
    return this.ringDashoffset(this.myRating);
  }

  get imdbRatingDashoffset(): number {
    return this.ringDashoffset(this.imdbRating?.averageRating ?? null);
  }

  toggleWatched(): void {
    if (this.isTogglingWatched || !this.tmdbId) return;
    this.isTogglingWatched = true;

    this.cinemaService
      .markEpisodeWatched({
        tmdbId: this.tmdbId,
        title: this.showTitle,
        cover: this.showCover,
        seasonNumber: this.seasonNumber,
        episodeNumber: this.episode.episodeNumber,
      })
      .subscribe({
        next: ({ data }) => {
          this.isTogglingWatched = false;
          this.episodeUpdated.emit({ ...this.episode, myReview: data });
        },
        error: () => {
          this.isTogglingWatched = false;
          this.toastr.error('Failed to update watched status.', 'Error');
        },
      });
  }

  openRateModal(): void {
    if (!this.tmdbId) return;

    const modalOptions: NgbModalOptions = {
      backdrop: 'static',
      keyboard: true,
      centered: true,
      scrollable: false,
    };

    const modalRef = this.modal.open(CinemaRateModalComponent, modalOptions);
    const instance = modalRef.componentInstance;
    instance.mode = 'episode';
    instance.tmdbId = this.tmdbId;
    instance.itemTitle = this.showTitle;
    instance.cover = this.showCover;
    instance.seasonNumber = this.seasonNumber;
    instance.episodeNumber = this.episode.episodeNumber;
    instance.displayTitle = this.episode.name || `Episode ${this.episode.episodeNumber}`;
    instance.displayYear = this.episode.airDate ? new Date(this.episode.airDate).getFullYear() : null;
    instance.typeLabel = 'Episode';
    instance.initialRating = this.myRating;
    instance.initialReviewText = this.episode.myReview?.reviewText ?? '';
    instance.initialContainsSpoilers = this.episode.myReview?.containsSpoilers ?? false;

    modalRef.result.then(
      (result) => {
        if (!result) return;
        this.episodeUpdated.emit({
          ...this.episode,
          myReview: {
            isWatched: true,
            decimalRating: result.decimalRating,
            reviewText: result.reviewText,
            containsSpoilers: result.containsSpoilers,
          },
        });

        if (this.currentUserId) {
          this.upsertMyReviewLocally({
            user: { _id: this.currentUserId, username: this.currentUsername, profilePicture: this.currentUserProfilePicture },
            decimalRating: result.decimalRating,
            reviewText: result.reviewText,
            containsSpoilers: result.containsSpoilers,
            reviewedAt: new Date().toISOString(),
          });
        }
      },
      () => {}
    );
  }
}
