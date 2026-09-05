import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface CinemaWatchlistFilterState {
  status: 'all' | 'unwatched' | 'watched';
  mediaType: 'all' | 'movie' | 'tv';
  releaseStatus: 'all' | 'available' | 'in_theaters' | 'coming_soon' | 'new_episodes' | 'back_in_theaters';
  genre: string; // '' = All Genres
  provider: string; // '' = All Providers
  sortBy: 'dateAdded' | 'releaseDate' | 'title';
  sortOrder: 'asc' | 'desc';
  hasReleaseDateOnly: boolean;
  hasRatingOnly: boolean;
  groupByReleaseStatus: boolean;
}

export const DEFAULT_WATCHLIST_FILTERS: CinemaWatchlistFilterState = {
  status: 'unwatched',
  mediaType: 'all',
  releaseStatus: 'all',
  genre: '',
  provider: '',
  sortBy: 'dateAdded',
  sortOrder: 'desc',
  hasReleaseDateOnly: false,
  hasRatingOnly: false,
  groupByReleaseStatus: false,
};

// "Sort & Filter" popup overlay for the watchlist panel - a draft copy of the
// parent's filter state is edited here and only pushed back up (via `apply`)
// when the user hits "Apply Filters", so closing without applying discards
// any in-progress changes.
@Component({
  selector: 'app-cinema-watchlist-filter',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cinema-watchlist-filter.component.html',
  styleUrl: './cinema-watchlist-filter.component.css',
})
export class CinemaWatchlistFilterComponent implements OnChanges {
  @Input() filters: CinemaWatchlistFilterState = { ...DEFAULT_WATCHLIST_FILTERS };
  @Input() genres: string[] = [];
  @Input() providers: string[] = [];

  @Output() apply = new EventEmitter<CinemaWatchlistFilterState>();
  @Output() closed = new EventEmitter<void>();

  draft: CinemaWatchlistFilterState = { ...DEFAULT_WATCHLIST_FILTERS };

  // Native <select> option lists can't be restyled (browser-rendered, ignores
  // our CSS) - these three use a custom dropdown (button + absolutely
  // positioned list) instead, so the open list matches the app's dark theme.
  openDropdown: 'sort' | 'genre' | 'provider' | null = null;

  readonly sortOptions: { value: string; label: string }[] = [
    { value: 'dateAdded-desc', label: 'Date Added - Newest First' },
    { value: 'dateAdded-asc', label: 'Date Added - Oldest First' },
    { value: 'releaseDate-desc', label: 'Release Date - Newest First' },
    { value: 'releaseDate-asc', label: 'Release Date - Oldest First' },
    { value: 'title-asc', label: 'Title - A-Z' },
    { value: 'title-desc', label: 'Title - Z-A' },
  ];

  get sortLabel(): string {
    return this.sortOptions.find((o) => o.value === this.sortCombinedValue)?.label || '';
  }

  get genreLabel(): string {
    return this.draft.genre || 'All Genres';
  }

  get providerLabel(): string {
    return this.draft.provider || 'All Providers';
  }

  toggleDropdown(name: 'sort' | 'genre' | 'provider'): void {
    this.openDropdown = this.openDropdown === name ? null : name;
  }

  selectGenre(genre: string): void {
    this.draft.genre = genre;
    this.openDropdown = null;
  }

  selectProvider(provider: string): void {
    this.draft.provider = provider;
    this.openDropdown = null;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['filters']) {
      this.draft = { ...this.filters };
    }
  }

  // Single dropdown combining sortBy+sortOrder (e.g. "dateAdded-desc") instead
  // of a separate select + Newest/Oldest pill row.
  get sortCombinedValue(): string {
    return `${this.draft.sortBy}-${this.draft.sortOrder}`;
  }

  setSortCombined(value: string): void {
    const separatorIndex = value.lastIndexOf('-');
    this.draft.sortBy = value.slice(0, separatorIndex) as CinemaWatchlistFilterState['sortBy'];
    this.draft.sortOrder = value.slice(separatorIndex + 1) as CinemaWatchlistFilterState['sortOrder'];
    this.openDropdown = null;
  }

  setStatus(status: CinemaWatchlistFilterState['status']): void {
    this.draft.status = status;
  }

  setMediaType(mediaType: CinemaWatchlistFilterState['mediaType']): void {
    this.draft.mediaType = mediaType;
  }

  setReleaseStatus(releaseStatus: CinemaWatchlistFilterState['releaseStatus']): void {
    this.draft.releaseStatus = releaseStatus;
    // These release statuses only apply to one media type, so jump the
    // All/Movies/Shows tab to match instead of showing a filter that can
    // never match anything under the currently-selected tab.
    if (releaseStatus === 'new_episodes') {
      this.draft.mediaType = 'tv';
    } else if (releaseStatus === 'in_theaters' || releaseStatus === 'back_in_theaters') {
      this.draft.mediaType = 'movie';
      // Newest theatrical releases first, so a movie that's been sitting in
      // theaters for months doesn't bury ones that just opened.
      this.draft.sortBy = 'releaseDate';
      this.draft.sortOrder = 'desc';
    }
  }

  reset(): void {
    this.draft = { ...DEFAULT_WATCHLIST_FILTERS };
  }

  applyFilters(): void {
    this.apply.emit(this.draft);
  }

  close(): void {
    this.closed.emit();
  }
}
