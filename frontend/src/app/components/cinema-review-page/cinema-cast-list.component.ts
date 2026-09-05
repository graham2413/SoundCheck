import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
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
export class CinemaCastListComponent {
  @Input() cast: CastMember[] = [];

  @Output() back = new EventEmitter<void>();

  showSearch = false;
  searchQuery = '';
  showSortMenu = false;
  sortBy: SortOption = 'order';
  selectedMember: CastMember | null = null;
  showPopularActors = false;

  readonly sortOptions: SortOption[] = ['order', 'name', 'popularity'];
  readonly sortLabels: Record<SortOption, string> = {
    order: 'Credit Order',
    name: 'Name',
    popularity: 'Popularity',
  };

  get filteredSortedCast(): CastMember[] {
    const query = this.searchQuery.trim().toLowerCase();
    const filtered = query
      ? this.cast.filter((m) => m.name.toLowerCase().includes(query))
      : this.cast;

    const sorted = [...filtered];
    if (this.sortBy === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (this.sortBy === 'popularity') {
      sorted.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
    } else {
      sorted.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }
    return sorted;
  }

  toggleSearch(): void {
    this.showSearch = !this.showSearch;
    if (!this.showSearch) this.searchQuery = '';
  }

  setSortBy(option: SortOption): void {
    this.sortBy = option;
    this.showSortMenu = false;
  }
}
