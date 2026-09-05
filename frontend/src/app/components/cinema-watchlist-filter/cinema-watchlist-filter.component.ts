import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface CinemaWatchlistFilterState {
  status: 'all' | 'unwatched' | 'watched';
  mediaType: 'all' | 'movie' | 'tv';
  releaseStatus: 'all' | 'available' | 'in_theaters' | 'coming_soon';
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

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['filters']) {
      this.draft = { ...this.filters };
    }
  }

  get sortOrderLabels(): { asc: string; desc: string } {
    if (this.draft.sortBy === 'title') return { asc: 'A-Z', desc: 'Z-A' };
    return { asc: 'Oldest First', desc: 'Newest First' };
  }

  setStatus(status: CinemaWatchlistFilterState['status']): void {
    this.draft.status = status;
  }

  setMediaType(mediaType: CinemaWatchlistFilterState['mediaType']): void {
    this.draft.mediaType = mediaType;
  }

  setReleaseStatus(releaseStatus: CinemaWatchlistFilterState['releaseStatus']): void {
    this.draft.releaseStatus = releaseStatus;
  }

  setSortOrder(sortOrder: CinemaWatchlistFilterState['sortOrder']): void {
    this.draft.sortOrder = sortOrder;
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
