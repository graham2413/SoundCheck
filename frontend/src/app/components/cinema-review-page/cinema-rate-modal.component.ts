import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, ElementRef, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { CinemaService } from '../../services/cinema.service';
import { NavbarVisibilityService } from '../../services/navbar-visibility.service';

export interface CinemaRateModalResult {
  decimalRating: number;
  reviewText: string;
  containsSpoilers: boolean;
}

// Shared "Create/Edit Review" modal for cinema items (movies, shows, and
// individual episodes) - one visual design (per the provided mockup) reused
// across every cinema rating entry point instead of the old shared
// music+cinema ReviewPageComponent modal. Music reviews are untouched for
// now (still on the legacy modal) - this is cinema-only per current scope.
@Component({
  selector: 'app-cinema-rate-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cinema-rate-modal.component.html',
  styleUrls: ['./cinema-rate-modal.component.css'],
})
export class CinemaRateModalComponent implements OnInit, OnDestroy {
  // What this modal is rating - drives which backend endpoint gets called
  // and whether the second header line shows genres or season/episode.
  @Input() mode: 'cinema' | 'episode' = 'cinema';

  // Identity/fallback-metadata for the create-if-missing backend calls.
  @Input() tmdbId = '';
  @Input() mediaType: 'movie' | 'tv' = 'movie';
  @Input() itemTitle = ''; // show/movie title (used to create the CinemaItem if it doesn't exist yet)
  @Input() cover: string | null = null;
  @Input() releaseDate: string | null = null;
  @Input() seasonNumber: number | null = null; // episode mode only
  @Input() episodeNumber: number | null = null; // episode mode only

  // Header display only.
  @Input() displayTitle = '';
  @Input() displayYear: number | string | null = null;
  @Input() certification: string | null = null;
  @Input() typeLabel = ''; // e.g. "Movie", "TV Show" - blank hides that segment
  @Input() genres: string[] = []; // ignored when mode === 'episode'

  // Existing values - null rating means "create" (title reads Create Review,
  // starts at the neutral 5.0 default); a non-null rating means "edit".
  @Input() initialRating: number | null = null;
  @Input() initialReviewText = '';
  @Input() initialContainsSpoilers = false;

  rating = 5.0;
  reviewText = '';
  containsSpoilers = false;
  isSaving = false;

  // Tap-to-edit the big rating number - plain text until clicked, then
  // swaps to a real number input (auto-focused/selected) so the user can
  // type an exact value instead of only tapping -/+.
  isEditingRatingNumber = false;
  ratingInputValue = '';
  @ViewChild('ratingInput') ratingInputEl?: ElementRef<HTMLInputElement>;

  // Confetti burst when the rating settles on a perfect 10 - see
  // spawnTenCelebrationConfetti(), same technique as the legacy
  // review-page's Overall Rating ring.
  tenCelebrationParticles: { cx: number; cy: number; px: number; py: number; key: number; color: string }[] = [];
  private tenCelebrationTimeout: ReturnType<typeof setTimeout> | undefined;
  private tenCelebrationClearTimeout: ReturnType<typeof setTimeout> | undefined;
  private tenCelebrationParticleId = 0;

  // Press-and-hold ramp-up on the -/+ buttons - starts slow, accelerates the
  // longer it's held, instead of forcing repeated individual taps.
  private holdTimeout: ReturnType<typeof setTimeout> | undefined;
  private holdIntervalMs = 0;
  private static readonly HOLD_INITIAL_DELAY_MS = 400;
  private static readonly HOLD_START_INTERVAL_MS = 220;
  private static readonly HOLD_MIN_INTERVAL_MS = 40;
  private static readonly HOLD_RAMP_STEP_MS = 20;

  private static readonly RING_RADIUS = 80;
  readonly ringCircumference = 2 * Math.PI * CinemaRateModalComponent.RING_RADIUS;

  constructor(
    public activeModal: NgbActiveModal,
    private cinemaService: CinemaService,
    private toastr: ToastrService,
    private navbarVisibility: NavbarVisibilityService
  ) {
    this.navbarVisibility.hide();
  }

  ngOnInit(): void {
    this.rating = this.initialRating ?? 5.0;
    this.reviewText = this.initialReviewText ?? '';
    this.containsSpoilers = this.initialContainsSpoilers ?? false;
    this.checkForLoadTenCelebration();
  }

  ngOnDestroy(): void {
    clearTimeout(this.holdTimeout);
    clearTimeout(this.tenCelebrationTimeout);
    clearTimeout(this.tenCelebrationClearTimeout);
    this.navbarVisibility.show();
  }

  get isEdit(): boolean {
    return this.initialRating != null;
  }

  get ringDashoffset(): number {
    const percent = Math.min(Math.max(this.rating, 0), 10) / 10;
    return this.ringCircumference * (1 - percent);
  }

  get formattedRating(): string {
    return this.rating.toFixed(1);
  }

  get moodLabel(): string {
    if (this.rating >= 10) return 'Peak';
    if (this.rating >= 9) return 'Amazing';
    if (this.rating >= 7.5) return 'Great';
    if (this.rating >= 6) return 'Good';
    if (this.rating >= 4) return 'Bad';
    return 'Terrible';
  }

  get reviewCharCount(): number {
    return this.reviewText?.length ?? 0;
  }

  adjustRating(delta: number): void {
    const next = Math.round((this.rating + delta) * 10) / 10;
    this.rating = Math.min(10, Math.max(0, next));
    this.checkForTenCelebration();
  }

  startEditingRatingNumber(): void {
    this.isEditingRatingNumber = true;
    this.ratingInputValue = this.formattedRating;
    setTimeout(() => {
      const input = this.ratingInputEl?.nativeElement;
      if (!input) return;
      input.focus();
      // Place the cursor at the end instead of selecting/highlighting the value.
      const len = input.value.length;
      input.setSelectionRange(len, len);
    });
  }

  commitRatingInput(): void {
    if (!this.isEditingRatingNumber) return;
    this.isEditingRatingNumber = false;

    const parsed = Math.round(parseFloat(this.ratingInputValue) * 10) / 10;
    if (!Number.isFinite(parsed)) return;
    this.rating = Math.min(10, Math.max(0, parsed));
    this.checkForTenCelebration();
  }

  cancelEditingRatingNumber(): void {
    this.isEditingRatingNumber = false;
  }

  // Called on pointerdown - applies one immediate step, then (if still held)
  // starts ramping via rampAdjust below.
  startAdjust(delta: number): void {
    this.stopAdjust();
    this.adjustRating(delta);
    this.holdIntervalMs = CinemaRateModalComponent.HOLD_START_INTERVAL_MS;
    this.holdTimeout = setTimeout(() => this.rampAdjust(delta), CinemaRateModalComponent.HOLD_INITIAL_DELAY_MS);
  }

  private rampAdjust(delta: number): void {
    this.adjustRating(delta);
    this.holdIntervalMs = Math.max(
      CinemaRateModalComponent.HOLD_MIN_INTERVAL_MS,
      this.holdIntervalMs - CinemaRateModalComponent.HOLD_RAMP_STEP_MS
    );
    this.holdTimeout = setTimeout(() => this.rampAdjust(delta), this.holdIntervalMs);
  }

  stopAdjust(): void {
    clearTimeout(this.holdTimeout);
    this.holdTimeout = undefined;
  }

  trackCelebrationParticle(_index: number, particle: { key: number }): number {
    return particle.key;
  }

  private isMaxRating(): boolean {
    return Math.round(this.rating * 10) / 10 >= 10;
  }

  // Once the rating settles on exactly 10 (unchanged for 250ms), plays a
  // one-off confetti burst.
  private checkForTenCelebration(): void {
    clearTimeout(this.tenCelebrationTimeout);
    if (!this.isMaxRating()) return;

    this.tenCelebrationTimeout = setTimeout(() => {
      if (this.isMaxRating()) this.spawnTenCelebrationConfetti();
    }, 250);
  }

  // Plays the burst once if the modal opens already showing a saved 10
  // (editing an existing perfect rating), not just when reaching 10 live.
  private checkForLoadTenCelebration(): void {
    if (this.isMaxRating()) this.spawnTenCelebrationConfetti();
  }

  private spawnTenCelebrationConfetti(): void {
    const colors = [
      '#f43f5e', '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
      '#22c55e', '#14b8a6', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#ffffff',
    ];
    const center = 90;
    const ringRadius = CinemaRateModalComponent.RING_RADIUS;

    // Each particle starts on the ring and shoots outward along its own
    // angle, past the ring's edge, for a "bursting away" look.
    this.tenCelebrationParticles = Array.from({ length: 28 }, () => {
      const angle = Math.random() * 2 * Math.PI;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const outwardDistance = 20 + Math.random() * 24;

      return {
        cx: center + ringRadius * cos,
        cy: center + ringRadius * sin,
        px: cos * outwardDistance,
        py: sin * outwardDistance,
        key: this.tenCelebrationParticleId++,
        color: colors[Math.floor(Math.random() * colors.length)],
      };
    });

    clearTimeout(this.tenCelebrationClearTimeout);
    this.tenCelebrationClearTimeout = setTimeout(() => {
      this.tenCelebrationParticles = [];
    }, 1500);
  }

  submit(): void {
    if (this.isSaving) return;
    this.isSaving = true;

    const payloadBase = {
      decimalRating: this.rating,
      reviewText: this.reviewText,
      containsSpoilers: this.containsSpoilers,
    };

    const onSuccess = (data: unknown) => {
      this.isSaving = false;
      this.toastr.success('Review saved.', 'Success');
      const result: CinemaRateModalResult & { raw: unknown } = { ...payloadBase, raw: data };
      this.activeModal.close(result);
    };
    const onError = () => {
      this.isSaving = false;
      this.toastr.error('Error occurred while saving your review.', 'Error');
    };

    if (this.mode === 'episode') {
      this.cinemaService
        .rateEpisode({
          tmdbId: this.tmdbId,
          title: this.itemTitle,
          cover: this.cover,
          releaseDate: this.releaseDate,
          seasonNumber: this.seasonNumber!,
          episodeNumber: this.episodeNumber!,
          ...payloadBase,
        })
        .subscribe({ next: ({ data }) => onSuccess(data), error: onError });
    } else {
      this.cinemaService
        .rateCinema({
          tmdbId: this.tmdbId,
          mediaType: this.mediaType,
          title: this.itemTitle,
          cover: this.cover,
          releaseDate: this.releaseDate,
          ...payloadBase,
        })
        .subscribe({ next: ({ data }) => onSuccess(data), error: onError });
    }
  }
}
