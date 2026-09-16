import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TopThreeService } from 'src/app/services/top-three.service';
import { SearchService } from 'src/app/services/search.service';
import { CinemaService } from 'src/app/services/cinema.service';
import { UserService } from 'src/app/services/user.service';
import { TopThreeCategory, TopThreeItem, TopThreeResponse } from 'src/app/models/responses/top-three.response';

const CATEGORY_LABELS: Record<TopThreeCategory, string> = {
  movies: 'Movies',
  shows: 'Shows',
  songs: 'Songs',
  albums: 'Albums',
  artists: 'Artists',
};

const ALL_CATEGORIES: TopThreeCategory[] = ['movies', 'shows', 'songs', 'albums', 'artists'];

@Component({
  selector: 'app-top-three-manage',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './top-three-manage.component.html',
  styleUrls: ['./top-three-manage.component.css'],
})
export class TopThreeManageComponent implements OnInit, OnDestroy {
  readonly allCategories = ALL_CATEGORIES;
  readonly categoryLabels = CATEGORY_LABELS;

  category: TopThreeCategory = 'movies';
  viewedUserId: string | null = null;
  isOwn = true;
  isPrivate = false;

  data: TopThreeResponse | null = null;
  isLoading = true;

  // Shared across the current-items list, search results, and picked-items
  // thumbnails - all keyed by item id, so a cover already loaded in one of
  // those doesn't re-show a spinner if it reappears in another.
  imageLoaded: { [itemId: string]: boolean } = {};

  showSettings = false;
  isSavingAuto: Partial<Record<TopThreeCategory, boolean>> = {};

  // Search-and-pick flow (own profile only) - picks accumulate in order,
  // matching "add them in the order chosen" for now.
  isPicking = false;
  pickedItems: TopThreeItem[] = [];
  searchQuery = '';
  searchResults: TopThreeItem[] = [];
  isSearching = false;
  isSaving = false;
  private searchDebounce: ReturnType<typeof setTimeout> | null = null;

  private loggedInUserId: string | null = null;
  // Guards against re-running load() off of userProfile$'s replayed emissions
  // (the navbar silently re-fetches it on route changes to keep the friend-
  // request badge current - see other-profile-page.component.ts's identical
  // guard) once we've already resolved isOwn/fetched data for the current params.
  private hasLoadedForCurrentParams = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private topThreeService: TopThreeService,
    private searchService: SearchService,
    private cinemaService: CinemaService,
    private userService: UserService
  ) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe((params) => {
      this.category = this.allCategories.includes(params['category']) ? params['category'] : 'movies';
      this.viewedUserId = params['userId'] || null;
      this.isLoading = true;
      this.isPrivate = false;
      this.isPicking = false;
      this.hasLoadedForCurrentParams = false;

      this.userService.userProfile$.subscribe((profile) => {
        if (profile) this.loggedInUserId = profile._id;
        if (this.hasLoadedForCurrentParams) return;
        // Own-profile case doesn't need to wait on the profile to resolve;
        // only "am I viewing someone else who happens to be me" does.
        if (!this.viewedUserId || this.loggedInUserId) {
          this.hasLoadedForCurrentParams = true;
          this.load();
        }
      });
    });
  }

  ngOnDestroy(): void {
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
  }

  private load(): void {
    this.isOwn = !this.viewedUserId || this.viewedUserId === this.loggedInUserId;

    const request$ = this.isOwn ? this.topThreeService.getMyTopThree() : this.topThreeService.getUserTopThree(this.viewedUserId!);

    request$.subscribe({
      next: (response) => {
        this.isLoading = false;
        if (!response.isPublic && !this.isOwn) {
          this.isPrivate = true;
          return;
        }
        this.data = response as TopThreeResponse;
      },
      error: () => {
        this.isLoading = false;
        this.isPrivate = true;
      },
    });
  }

  goBack(): void {
    // viewedUserId is only set when arriving here via someone else's podium
    // ("See All" on a profile that isn't your own) - on your own it's null,
    // so falling back to it left this navigating to '/profile/' (empty
    // :userId segment) instead of your actual profile route.
    const targetUserId = this.viewedUserId || this.loggedInUserId;
    if (targetUserId) {
      this.router.navigate(['/profile', targetUserId]);
    } else {
      this.router.navigate(['/profile']);
    }
  }

  selectCategory(category: TopThreeCategory): void {
    if (this.category === category) return;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { category, userId: this.viewedUserId || undefined },
      queryParamsHandling: 'merge',
    });
  }

  get categoryLabel(): string {
    return this.categoryLabels[this.category];
  }

  get currentItems(): TopThreeItem[] {
    return this.data?.[this.category]?.items ?? [];
  }

  get isManual(): boolean {
    return !!this.data?.[this.category]?.manualOverride;
  }

  toggleSettings(): void {
    this.showSettings = !this.showSettings;
  }

  isCategoryManual(category: TopThreeCategory): boolean {
    return !!this.data?.[category]?.manualOverride;
  }

  // Flipping a category to manual just seeds it with whatever auto picked
  // (if it already had 3) so it doesn't go blank - otherwise there's nothing
  // to seed with, so this drops straight into the add flow for that category
  // instead of leaving it in a half-configured state.
  setCategoryManual(category: TopThreeCategory): void {
    if (this.isCategoryManual(category)) return;
    const currentAutoItems = this.data?.[category]?.items ?? [];

    if (currentAutoItems.length === 3) {
      this.isSavingAuto[category] = true;
      this.topThreeService.setCategory(category, currentAutoItems).subscribe({
        next: () => {
          this.isSavingAuto[category] = false;
          this.load();
        },
        error: () => (this.isSavingAuto[category] = false),
      });
      return;
    }

    this.showSettings = false;
    this.selectCategory(category);
    this.startPicking();
  }

  setCategoryAuto(category: TopThreeCategory): void {
    if (!this.isCategoryManual(category)) return;
    this.isSavingAuto[category] = true;
    this.topThreeService.setAuto(category).subscribe({
      next: () => {
        this.isSavingAuto[category] = false;
        this.load();
      },
      error: () => (this.isSavingAuto[category] = false),
    });
  }

  startPicking(): void {
    this.isPicking = true;
    this.pickedItems = [];
    this.searchQuery = '';
    this.searchResults = [];
  }

  cancelPicking(): void {
    this.isPicking = false;
  }

  onSearchInput(): void {
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    const query = this.searchQuery.trim();
    if (!query) {
      this.searchResults = [];
      return;
    }
    this.searchDebounce = setTimeout(() => this.runSearch(query), 350);
  }

  private runSearch(query: string): void {
    this.isSearching = true;

    if (this.category === 'movies' || this.category === 'shows') {
      const mediaType = this.category === 'movies' ? 'movie' : 'tv';
      this.cinemaService.searchCinema(query).subscribe({
        next: (response) => {
          this.isSearching = false;
          this.searchResults = (response.data || [])
            .filter((result) => result.mediaType === mediaType)
            .map((result) => ({
              id: result.tmdbId,
              title: result.title,
              subtitle: result.releaseDate ? String(new Date(result.releaseDate).getFullYear()) : '',
              cover: result.cover || '',
            }));
        },
        error: () => {
          this.isSearching = false;
          this.searchResults = [];
        },
      });
      return;
    }

    const searchType = this.category === 'songs' ? 'songs' : this.category === 'albums' ? 'albums' : 'artists';
    this.searchService.searchMusic(query, searchType).subscribe({
      next: (response) => {
        this.isSearching = false;
        if (this.category === 'songs') {
          this.searchResults = response.songs.map((song) => ({
            id: String(song.id),
            title: song.title,
            subtitle: song.artist,
            cover: song.cover,
          }));
        } else if (this.category === 'albums') {
          this.searchResults = response.albums.map((album) => ({
            id: String(album.id),
            title: album.title,
            subtitle: album.artist,
            cover: album.cover,
          }));
        } else {
          this.searchResults = response.artists.map((artist) => ({
            id: String(artist.id),
            title: artist.name,
            cover: artist.picture,
          }));
        }
      },
      error: () => {
        this.isSearching = false;
        this.searchResults = [];
      },
    });
  }

  isPicked(item: TopThreeItem): boolean {
    return this.pickedItems.some((picked) => picked.id === item.id);
  }

  pickItem(item: TopThreeItem): void {
    if (this.isPicked(item) || this.pickedItems.length >= 3) return;
    this.pickedItems = [...this.pickedItems, item];
    if (this.pickedItems.length === 3) this.savePicks();
  }

  removePicked(item: TopThreeItem): void {
    this.pickedItems = this.pickedItems.filter((picked) => picked.id !== item.id);
  }

  private savePicks(): void {
    this.isSaving = true;
    this.topThreeService.setCategory(this.category, this.pickedItems).subscribe({
      next: () => {
        this.isSaving = false;
        this.isPicking = false;
        this.load();
      },
      error: () => (this.isSaving = false),
    });
  }
}
