import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

export interface WatchProvider {
  name: string;
  logoUrl: string | null;
}

// New unified (single responsive layout, no separate mobile/desktop
// templates) cinema review detail page - built top-down in chunks against
// the provided mockup. Movies first; TV/season-episode support comes later.
// Kept fully separate from the existing shared review-page component so the
// music review flow isn't touched while this is iterated on.
@Component({
  selector: 'app-cinema-review-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cinema-review-page.component.html',
  styleUrls: ['./cinema-review-page.component.css'],
})
export class CinemaReviewPageComponent {
  @Input() title = '';
  @Input() cover: string | null = null;
  @Input() year: number | null = null;
  @Input() runtimeMinutes: number | null = null;
  @Input() certification: string | null = null;
  @Input() releaseDate: string | null = null;
  @Input() genres: string[] = [];
  @Input() appRating: number | null = null;
  @Input() appReviewCount: number | null = null;
  @Input() imdbRating: number | null = null;
  @Input() imdbVoteCount: number | null = null;
  @Input() isWatchlist = false;
  @Input() description: string | null = null;
  @Input() director: string | null = null;
  @Input() awardsSummary: string | null = null;
  @Input() boxOffice: string | null = null;
  @Input() watchProviders: WatchProvider[] = [];

  @Output() back = new EventEmitter<void>();
  @Output() moreOptions = new EventEmitter<void>();
  @Output() addToWatchlist = new EventEmitter<void>();
  @Output() rate = new EventEmitter<void>();
  @Output() viewCast = new EventEmitter<void>();
  @Output() viewAwards = new EventEmitter<void>();
  @Output() seeAllProviders = new EventEmitter<void>();

  isDescriptionExpanded = false;

  readonly tabs = ['Overview', 'Cast', 'Reviews', 'Trailer', 'Similar'] as const;
  activeTab: (typeof this.tabs)[number] = 'Overview';

  private static readonly VISIBLE_PROVIDER_COUNT = 5;

  get visibleWatchProviders(): WatchProvider[] {
    return this.watchProviders.slice(0, CinemaReviewPageComponent.VISIBLE_PROVIDER_COUNT);
  }

  get remainingWatchProviderCount(): number {
    return Math.max(0, this.watchProviders.length - CinemaReviewPageComponent.VISIBLE_PROVIDER_COUNT);
  }

  private static readonly NEW_RELEASE_WINDOW_DAYS = 30;
  private static readonly RING_RADIUS = 45;

  get ringCircumference(): number {
    return 2 * Math.PI * CinemaReviewPageComponent.RING_RADIUS;
  }

  get appRingDashoffset(): number {
    return this.ringDashoffset(this.appRating);
  }

  get imdbRingDashoffset(): number {
    return this.ringDashoffset(this.imdbRating);
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
    return `${hours}h ${minutes}m`;
  }

  get isUpcoming(): boolean {
    return !!this.releaseDate && this.parseLocalDate(this.releaseDate) > new Date();
  }

  // Only one status pill shows at a time - upcoming takes priority over
  // "recent" since a re-released/upcoming title isn't a "new release" yet
  get isRecentRelease(): boolean {
    if (!this.releaseDate || this.isUpcoming) return false;
    const daysSinceRelease =
      (Date.now() - this.parseLocalDate(this.releaseDate).getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceRelease <= CinemaReviewPageComponent.NEW_RELEASE_WINDOW_DAYS;
  }

  get formattedReleaseDate(): string | null {
    if (!this.releaseDate) return null;
    return this.parseLocalDate(this.releaseDate).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  // releaseDate is a date-only string (e.g. "2026-12-25") - parsing it
  // directly with `new Date()` treats it as UTC midnight, which shifts a day
  // back in timezones behind UTC once read back via local getters/toLocaleDateString.
  private parseLocalDate(dateOnly: string): Date {
    const [year, month, day] = dateOnly.slice(0, 10).split('-').map(Number);
    return new Date(year, month - 1, day);
  }
}
