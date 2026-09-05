import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { PROVIDER_LOGO_OVERRIDES } from '../../shared/provider-logo-overrides';
import { getTvEpisodeBadge, tvEpisodeBadgeLabel, TvEpisodeBadge } from '../../shared/tv-episode-badge';
import { getMovieRereleaseBadge, movieRereleaseBadgeLabel, MovieRereleaseBadge } from '../../shared/movie-rerelease-badge';
import { getMovieReleaseBadge, movieReleaseBadgeLabel, MovieReleaseBadge } from '../../shared/movie-release-badge';

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
  @Input() mediaType: 'movie' | 'tv' | null = null;
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
  @Input() description: string | null = null;
  @Input() director: string | null = null;
  @Input() awardsSummary: string | null = null;
  @Input() boxOffice: string | null = null;
  @Input() watchProviders: WatchProvider[] = [];

  @Output() back = new EventEmitter<void>();
  @Output() moreOptions = new EventEmitter<void>();
  @Output() addToWatchlist = new EventEmitter<void>();
  @Output() rate = new EventEmitter<void>();
  @Output() markWatched = new EventEmitter<void>();
  @Output() viewCast = new EventEmitter<void>();
  @Output() viewAwards = new EventEmitter<void>();
  @Output() seeAllProviders = new EventEmitter<void>();

  isDescriptionExpanded = false;

  readonly tabs = ['Overview', 'Reviews', 'Trailer', 'Similar'] as const;
  activeTab: (typeof this.tabs)[number] = 'Overview';

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

  private static readonly NEW_RELEASE_WINDOW_DAYS = 30;
  private static readonly RING_RADIUS = 45;

  // TV only - "New Episode" (aired recently) / "New Season Soon" (premiere
  // airs soon) / "Airing Soon" (regular next episode airs soon) - one at a
  // time, mirrors the same shared logic used by watchlist/search rows.
  get episodeBadge(): TvEpisodeBadge {
    if (this.mediaType !== 'tv') return null;
    return getTvEpisodeBadge(this.lastEpisodeAirDate, this.nextEpisodeAirDate, this.nextEpisodeNumber);
  }

  get isNewEpisode(): boolean {
    return this.episodeBadge === 'new-episode';
  }

  get isAiringSoon(): boolean {
    return this.episodeBadge === 'airing-soon';
  }

  get isNewSeasonSoon(): boolean {
    return this.episodeBadge === 'new-season';
  }

  get episodeBadgeLabel(): string {
    return tvEpisodeBadgeLabel(this.episodeBadge);
  }

  // Movie only - a later theatrical reissue on record (e.g. an anniversary
  // re-release), independent of the "Coming Soon"/"New Release" badges above.
  get movieRereleaseBadge(): MovieRereleaseBadge {
    if (this.mediaType !== 'movie') return null;
    return getMovieRereleaseBadge(this.rereleaseDate);
  }

  get movieRereleaseBadgeLabel(): string {
    return movieRereleaseBadgeLabel(this.movieRereleaseBadge);
  }

  // Movie only - "In Theaters"/"New Release" for the ORIGINAL release, takes
  // priority over the rerelease badge above.
  get movieReleaseBadge(): MovieReleaseBadge {
    if (this.mediaType !== 'movie') return null;
    return getMovieReleaseBadge({
      releaseDate: this.releaseDate,
      hadTheatricalRelease: this.hadTheatricalRelease,
      hasStreamingAvailability: this.watchProviders.length > 0,
      digitalReleaseDate: this.digitalReleaseDate,
    });
  }

  get movieReleaseBadgeLabel(): string {
    return movieReleaseBadgeLabel(this.movieReleaseBadge);
  }

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
    if (hours && minutes) return `${hours}h ${minutes}m`;
    if (hours) return `${hours}h`;
    return `${minutes}m`;
  }

  get isUpcoming(): boolean {
    return !!this.releaseDate && this.parseLocalDate(this.releaseDate) > new Date();
  }

  // TV only - the series itself just premiered recently (movies use the
  // smarter movieReleaseBadge above, which accounts for theatrical windows).
  get isNewSeriesRelease(): boolean {
    if (this.mediaType !== 'tv' || !this.releaseDate || this.isUpcoming) return false;
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
