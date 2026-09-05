import { Injectable } from '@angular/core';
import { Song } from '../models/responses/song-response';
import { Album } from '../models/responses/album-response';
import { Artist } from '../models/responses/artist-response';
import { CinemaSearchResult } from '../models/responses/cinema-response';

export interface MainSearchState {
  searchType: 'music' | 'cinema';
  query: string;
  lastSearchedQuery: string;
  searchAttempted: boolean;
  selectedSearchTab: 'songs' | 'albums' | 'artists';
  activeTab: 'songs' | 'albums' | 'artists';
  results: { songs: Song[]; albums: Album[]; artists: Artist[] };
  filteredResults: { songs: Song[]; albums: Album[]; artists: Artist[] };
  selectedGenre: { songs: string; albums: string };
  cinemaResults: CinemaSearchResult[];
  scrollY: number;
}

// Remembers the main search page's mode/query/results/scroll position across
// navigation - MainSearchComponent gets destroyed/recreated on every route
// change, so without this, leaving the page (e.g. to view a profile) and
// coming back always reset to a blank music search.
@Injectable({ providedIn: 'root' })
export class MainSearchStateService {
  private state: MainSearchState | null = null;

  save(state: MainSearchState): void {
    this.state = state;
  }

  getState(): MainSearchState | null {
    return this.state;
  }
}
