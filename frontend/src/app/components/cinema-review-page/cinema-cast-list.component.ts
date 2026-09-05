import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CinemaPersonDetailComponent } from './cinema-person-detail.component';
import { CinemaPopularActorsComponent } from './cinema-popular-actors.component';

export interface CastMember {
  personId?: number;
  name: string;
  character: string;
  profilePath: string | null;
  order?: number;
  popularity?: number;
}

type SortOption = 'order' | 'name' | 'popularity';

// Full-screen Cast view (opened from the "View full cast" row on Overview) -
// flat list (no Main Cast/Supporting/Crew split - TMDb doesn't actually label
// that, it would've been an arbitrary guess), with client-side name search
// and a sort control (Credit Order/Name/Popularity - all real TMDb fields
// already present on each cast entry, no extra API calls needed).
@Component({
  selector: 'app-cinema-cast-list',
  standalone: true,
  imports: [CommonModule, FormsModule, CinemaPersonDetailComponent, CinemaPopularActorsComponent],
  templateUrl: './cinema-cast-list.component.html',
  styleUrl: './cinema-cast-list.component.css',
})
export class CinemaCastListComponent implements OnChanges {
  @Input() cast: CastMember[] = [];

  @Output() back = new EventEmitter<void>();

  showSearch = false;
  showSortMenu = false;
  selectedMember: CastMember | null = null;
  showPopularActors = false;

  readonly sortOptions: SortOption[] = ['order', 'name', 'popularity'];
  readonly sortLabels: Record<SortOption, string> = {
    order: 'Credit Order',
    name: 'Name',
    popularity: 'Popularity',
  };

  // Cast lists can have 300-500+ people (aggregate_credits across every
  // season). filteredSortedCast used to be a plain getter, which Angular
  // re-evaluates on EVERY change-detection cycle (any scroll/touch/event) -
  // for a list this size that's a full filter+sort re-run many times a
  // second, causing real jank on mobile-class CPUs. Now only recomputed
  // when cast/searchQuery/sortBy actually change, via the setters/ngOnChanges
  // below, and the template just reads the cached result.
  private _searchQuery = '';
  private _sortBy: SortOption = 'order';
  filteredSortedCast: CastMember[] = [];

  get searchQuery(): string {
    return this._searchQuery;
  }
  set searchQuery(value: string) {
    this._searchQuery = value;
    this.recomputeFilteredSortedCast();
  }

  get sortBy(): SortOption {
    return this._sortBy;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['cast']) {
      this.recomputeFilteredSortedCast();
    }
  }

  private recomputeFilteredSortedCast(): void {
    const query = this._searchQuery.trim().toLowerCase();
    const filtered = query
      ? this.cast.filter((m) => m.name.toLowerCase().includes(query))
      : this.cast;

    const sorted = [...filtered];
    if (this._sortBy === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (this._sortBy === 'popularity') {
      sorted.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
    } else {
      sorted.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }
    this.filteredSortedCast = sorted;
  }

  toggleSearch(): void {
    this.showSearch = !this.showSearch;
    if (!this.showSearch) this.searchQuery = '';
  }

  setSortBy(option: SortOption): void {
    this._sortBy = option;
    this.showSortMenu = false;
    this.recomputeFilteredSortedCast();
  }
}
