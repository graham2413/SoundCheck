import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import {
  NgbModal,
  NgbModalOptions,
  NgbModalRef,
} from '@ng-bootstrap/ng-bootstrap';
import { SearchService } from 'src/app/services/search.service';
import { ReviewPageComponent } from '../review-page/review-page.component';
import { ToastrService } from 'ngx-toastr';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Song } from 'src/app/models/responses/song-response';
import { Album } from 'src/app/models/responses/album-response';
import { Artist } from 'src/app/models/responses/artist-response';
import { SearchResponse } from 'src/app/models/responses/search-response';
import { ReviewService } from 'src/app/services/review.service';
import { TimeAgoPipe } from 'src/app/shared/timeAgo/time-ago.pipe';
import { Router } from '@angular/router';
import { Review } from 'src/app/models/responses/review-responses';
import { PopularRecord } from 'src/app/models/responses/popular-record-response';
import { UserService } from 'src/app/services/user.service';
import { User } from 'src/app/models/responses/user.response';
import { InfiniteScrollDirective } from 'ngx-infinite-scroll';
import { CinemaService } from 'src/app/services/cinema.service';
import { CinemaItem, CinemaSearchResult, CinemaActivityEntry } from 'src/app/models/responses/cinema-response';
import { getCinemaStatusBadge, CinemaBadgeVm } from 'src/app/shared/cinema-status-badge';
import { CinemaBadgeComponent } from 'src/app/shared/cinema-badge/cinema-badge.component';
import { CinemaReviewModalComponent } from '../cinema-review-page/cinema-review-modal.component';
import { CinemaRateModalComponent } from '../cinema-review-page/cinema-rate-modal.component';
import { MainSearchStateService } from 'src/app/services/main-search-state.service';
import { animate, animateChild, query, stagger, style, transition, trigger } from '@angular/animations';
import { MarqueeComponent } from './marquee/marquee.component';
import { CinemaMarqueeComponent } from './marquee/cinema-marquee.component';
import { SeeAllTrendingComponent } from './see-all-trending/see-all-trending.component';

type ActivityRecord = Review['albumSongOrArtist'];
type ModalRecord = Song | Album | Artist | PopularRecord | ActivityRecord;
type CinemaActivityEntryVm = CinemaActivityEntry & { likedByCurrentUser: boolean };
@Component({
  selector: 'app-main-search',
  templateUrl: './main-search.component.html',
  styleUrls: ['./main-search.component.css'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TimeAgoPipe,
    InfiniteScrollDirective,
    MarqueeComponent,
    CinemaMarqueeComponent,
    SeeAllTrendingComponent,
    CinemaBadgeComponent,
  ],
  animations: [
    trigger('fadeSlideIn', [
      // Animate the container
      transition(':enter', [
        query('@itemAnim', [
          stagger(50, animateChild())
        ], { optional: true })
      ])
    ]),

    // This handles each individual item
    trigger('itemAnim', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(-20px)' }), // swipe in from left
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateX(0)' }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0, transform: 'translateX(20px)' })) // swipe out to right
      ])
    ])
  ]
})
export class MainSearchComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('searchBar') searchBar!: ElementRef<HTMLDivElement>;
  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;

  @ViewChild('dropdownContainer') dropdownContainer!: ElementRef;
  @ViewChild('filterButton') filterButton!: ElementRef;

  // Used to vertically center the mobile Music/Cinema switch button between
  // the discover tabs bar's underline and the search bar - see
  // recomputeSwitchButtonPosition(). Optional since they're only present
  // while activeDiscoverTab === 'mainSearch'.
  @ViewChild('discoverTabsBar') discoverTabsBar?: ElementRef<HTMLDivElement>;
  @ViewChild('switchBtn') switchBtn?: ElementRef<HTMLButtonElement>;
  switchButtonTopPx: number | null = null;

  query: string = '';
  lastSearchedQuery: string = '';
  recentSearches: string[] = [];
  recentSearchesExpanded = false;
  private readonly RECENT_SEARCHES_LIMIT = 12;
  isLoading: boolean = false;
  activeTab: 'all' | 'songs' | 'albums' | 'artists' = 'all';
  // Only shows up to 5 results per tab until expanded - reset on every new search.
  resultsExpanded = false;
  // What the search-bar type button will search as next - independent of
  // `activeTab` so switching it doesn't change the currently shown results.
  selectedSearchTab: 'songs' | 'albums' | 'artists' = 'songs';
  activeDiscoverTab: 'mainSearch' | 'popular' | 'recentActivity' = 'mainSearch';
  // Remembers whichever tab was last used, across full app reloads (the
  // in-session MainSearchStateService restore below only survives
  // navigating away and back within the same app session, not a reload) -
  // defaults to 'cinema' the very first time, matching this app's prior
  // hardcoded default.
  private static readonly LAST_SEARCH_TYPE_KEY = 'lastSearchType';
  searchType: 'music' | 'cinema' =
    (localStorage.getItem(MainSearchComponent.LAST_SEARCH_TYPE_KEY) as 'music' | 'cinema') || 'cinema';
  // Lags `searchType` for the switch button's icon only, so the coin-flip
  // animation can swap the underlying image at the animation's invisible
  // midpoint instead of instantly on click - everything else (label,
  // subtitle, placeholder) still reacts to `searchType` immediately.
  displaySearchType: 'music' | 'cinema' = this.searchType;
  isFlippingSwitchIcon = false;
  private static readonly SWITCH_ICON_FLIP_SWAP_MS = 250; // must match the
    // 50% mark of .switch-icon-flip's keyframes (main-search.component.css)
  private static readonly SWITCH_ICON_FLIP_TOTAL_MS = 500; // must match
    // .switch-icon-flip's animation-duration

  get switchIconSrc(): string {
    return this.displaySearchType === 'cinema' ? 'assets/popcorn-icon.png' : 'assets/music-disc-icon.png';
  }
  cinemaResults: CinemaSearchResult[] = [];
  cinemaActiveTab: 'all' | 'movie' | 'tv' = 'all';
  isModalOpen = false;
  selectedRecord: Album | Artist | Song | null = null;
  searchAttempted = false;

  // Dropdown visibility state for genre filters
  showGenreDropdown = { songs: false, albums: false };

  // Available genres for filtering
  genres = {
    songs: [] as string[],
    albums: [] as string[],
    artists: [] as string[],
  };

  selectedGenre = { songs: '', albums: '' };

  // API results
  results: { songs: Song[]; albums: Album[]; artists: Artist[] } = {
    songs: [],
    albums: [],
    artists: [],
  };

  // Filtered results to store only matching genres
  filteredResults: { songs: Song[]; albums: Album[]; artists: Artist[] } = {
    songs: [],
    albums: [],
    artists: [],
  };

  popularRecords: PopularRecord[] = [];
  expandedReviews: { [reviewId: string]: boolean } = {};
  activePopularType: 'Song' | 'Album' | 'Artist' = 'Song';
  readonly popularTypes: Array<'Song' | 'Album' | 'Artist'> = [
    'Song',
    'Album',
    'Artist',
  ];
  // Was 'Friends' | 'Artists' (Feed vs Release Tracker) - Release Tracker
  // moved to the Calendar page's new Music mode, so this pill now just
  // filters the Feed tab's activity by content type instead. 'Music' reuses
  // the exact same friend-activity data/logic the old 'Friends' option had;
  // 'Cinema' is backed by its own cursor-paginated feed (cinemaActivityFeed).
  activeFeedType: 'Music' | 'Cinema' = 'Music';

  readonly activityFeedTypes: Array<'Music' | 'Cinema'> = [
    'Music',
    'Cinema',
  ];

  get feedTypeIndex(): number {
    return this.activeFeedType === 'Cinema' ? 1 : 0;
  }

  isDiscoverContentLoading: boolean = false;
  activityFeed: Review[] = [];
  section: string | null = null;
  userProfile: User = {
    _id: '',
    username: '',
    gradient: '',
    createdAt: '',
    reviews: [],
    googleId: '',
    email: '',
    friends: [],
    profilePicture: '',
    artistList: [],
    friendInfo: {
      friends: [],
      friendRequestsReceived: [],
      friendRequestsSent: [],
    },
  } as User;

  feedPageLimit: number = 20;

  activityFeedCursor: { cursorDate: string; cursorId: string } | null = null;
  hasMoreActivityFeed: boolean = true;
  isFetchingActivityFeed: boolean = false;

  // Cinema activity feed - same cursor-based load-more pattern as Music's
  // activityFeed above, backed by GET /api/cinema/activityFeed.
  cinemaActivityFeed: CinemaActivityEntryVm[] = [];
  cinemaActivityFeedCursor: { cursorDate: string; cursorId: string } | null = null;
  hasMoreCinemaActivityFeed: boolean = true;
  isFetchingCinemaActivityFeed: boolean = false;
  cinemaActivityImageLoaded: { [key: string]: boolean } = {};
  animateCinemaHeart: { [key: string]: boolean } = {};

  albums: any[] = [];
  imageLoaded = {
    songs: {} as { [index: number]: boolean },
    albums: {} as { [index: number]: boolean },
    artists: {} as { [index: number]: boolean },
    cinema: {} as { [index: number]: boolean },
  };

  popularImageLoaded = {
    song: {} as { [index: number]: boolean },
    album: {} as { [index: number]: boolean },
    artist: {} as { [index: number]: boolean },
  };

  activityImageLoaded: { [key: string]: boolean } = {};

  likedByCurrentUser?: boolean;
  animateHeart: { [reviewId: string]: boolean } = {};

  ratingDashOffsets: { [recordId: number]: number } = {};

  constructor(
    private searchService: SearchService,
    private modal: NgbModal,
    private toastr: ToastrService,
    private reviewService: ReviewService,
    private router: Router,
    private userService: UserService,
    private cinemaService: CinemaService,
    private searchStateService: MainSearchStateService,
    private cdRef: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    this.setUserProfile();

    // Warms the browser's image cache/decode for whichever of the two switch
    // icons ISN'T the initial searchType, so the very first flip never has
    // to decode a never-before-requested image mid-animation (the delay
    // that caused the old icon to visibly linger before snapping over).
    new Image().src = 'assets/popcorn-icon.png';
    new Image().src = 'assets/music-disc-icon.png';

    this.section = history.state.section || null;

    if (
      this.section === 'mainSearch' ||
      this.section === 'popular' ||
      this.section === 'recentActivity'
    ) {
      this.setActiveDiscoverTab(this.section);
    }

    this.restoreSearchState();
  }

  ngOnDestroy(): void {
    localStorage.setItem(MainSearchComponent.LAST_SEARCH_TYPE_KEY, this.searchType);

    this.searchStateService.save({
      searchType: this.searchType,
      query: this.query,
      lastSearchedQuery: this.lastSearchedQuery,
      searchAttempted: this.searchAttempted,
      selectedSearchTab: this.selectedSearchTab,
      activeTab: this.activeTab,
      results: this.results,
      filteredResults: this.filteredResults,
      selectedGenre: this.selectedGenre,
      cinemaResults: this.cinemaResults,
      scrollY: window.scrollY,
    });
  }

  // Restores whatever search mode/query/results/scroll position was active
  // last time this page was visited (see MainSearchStateService) - without
  // this, navigating away and back always resets to a blank music search.
  private restoreSearchState(): void {
    const saved = this.searchStateService.getState();
    if (!saved) return;

    // Restore the mode/query even if no search was actually completed (e.g.
    // the user just toggled to Cinema and left) - previously this whole
    // method bailed out on !searchAttempted, silently reverting the mode
    // back to music on return.
    this.searchType = saved.searchType;
    this.query = saved.query;
    this.lastSearchedQuery = saved.lastSearchedQuery;
    this.searchAttempted = saved.searchAttempted;
    this.selectedSearchTab = saved.selectedSearchTab;
    this.activeTab = saved.activeTab;
    this.results = saved.results;
    this.filteredResults = saved.filteredResults;
    this.selectedGenre = saved.selectedGenre;
    this.cinemaResults = saved.cinemaResults;

    // setUserProfile() (called just before this, in ngOnInit) already loaded
    // recent searches using the pre-restore (default 'music') searchType -
    // redo it now that the real mode has been restored, otherwise Cinema
    // mode shows Music's recent searches list until the user switches again.
    this.loadRecentSearches();

    if (!saved.searchAttempted) return;

    // Wait for the restored results to actually render before scrolling,
    // same pattern already used elsewhere in this component after a search
    setTimeout(() => window.scrollTo({ top: saved.scrollY }), 0);
  }

  onMarqueeCardClick(event: { album: any; list: any[]; index: number }): void {
    this.openModal(event.album, event.list, event.index);
  }

  cinemaMarqueeMode: 'movie' | 'tv' = 'movie';

  onCinemaMarqueeCardClick(event: { item: CinemaSearchResult; list: CinemaSearchResult[]; index: number }): void {
    this.openCinemaSearchResult(event.item);
  }

  // "See All" full-screen trending grid, opened from the "Trending Right
  // Now" row - shows music albums or cinema items depending on searchType.
  showSeeAllTrending = false;

  openSeeAllTrending(): void {
    this.showSeeAllTrending = true;
  }

  onSeeAllTrendingBack(): void {
    this.showSeeAllTrending = false;
  }

  onSeeAllMusicCardClick(event: { album: any; list: any[]; index: number }): void {
    this.openModal(event.album, event.list, event.index);
  }

  onSeeAllCinemaCardClick(event: { item: CinemaSearchResult; list: CinemaSearchResult[]; index: number }): void {
    this.openCinemaSearchResult(event.item);
  }

  setUserProfile() {
    // Subscribes to updates from the user profile observable
    this.userService.userProfile$.subscribe((profile) => {
      if (profile) {
        this.userProfile = profile;
        this.loadRecentSearches();
      }
    });

    if (!this.userProfile || !this.userProfile.username) {
      this.userService.getAuthenticatedUserProfile().subscribe({});
    }
  }

  @HostListener('document:click', ['$event'])
  clickOutside(event: Event) {
    const clickedInsideDropdown =
      this.dropdownContainer?.nativeElement.contains(event.target);
    const clickedFilterButton = this.filterButton?.nativeElement.contains(
      event.target
    );

    if (clickedInsideDropdown || clickedFilterButton) {
      return;
    }

    this.showGenreDropdown = { songs: false, albums: false };
  }

  onSearch(type: 'songs' | 'albums' | 'artists', useFallback: boolean = true) {
    const query = this.query.trim();
    if (!query) return;

    this.lastSearchedQuery = query;
    this.addRecentSearch(query);

    if (this.searchType === 'cinema') {
      this.searchCinemaResults();
      return;
    }

    (document.activeElement as HTMLElement)?.blur();

    setTimeout(() => {
      const searchBarEl = this.searchBar.nativeElement;
      const elementTop =
        searchBarEl.getBoundingClientRect().top + window.pageYOffset;

      let offsetPadding: number;

      const width = window.innerWidth;
      if (width >= 768) {
        offsetPadding = 170;
      } else {
        offsetPadding = 60; // Less padding for mobile screens
      }

      const offset = elementTop - offsetPadding;
      window.scrollTo({ top: offset, behavior: 'smooth' });
    }, 0);

    this.isLoading = true;

    if (!this.searchAttempted) {
      this.searchAttempted = true;
    }

    this.results = { songs: [], albums: [], artists: [] };
    this.filteredResults = { songs: [], albums: [], artists: [] };
    this.resultsExpanded = false;

    this.imageLoaded = {
      songs: {},
      albums: {},
      artists: {},
      cinema: this.imageLoaded.cinema,
    };

    // Single "all" request already returns songs+albums+artists together
    // (backend: mainSearchController's type=all branch) - so every search
    // populates the counts/pills for all 3 types at once, and switching
    // between All/Songs/Albums/Artists afterward is instant (no re-fetch).
    this.searchService.searchMusic(query, 'all').subscribe({
      next: (data: SearchResponse) => {
        this.results = {
          songs:
            data.songs?.map((song) => ({
              ...song,
              cover: this.getHighQualityImage(song.cover),
              type: 'Song' as const,
            })) || [],
          albums:
            data.albums?.map((album) => ({
              ...album,
              cover: this.getHighQualityImage(album.cover),
              type: 'Album' as const,
            })) || [],
          artists:
            data.artists?.map((artist) => ({
              ...artist,
              picture: this.getHighQualityImage(artist.picture),
              type: 'Artist' as const,
            })) || [],
        };

        this.filteredResults = { ...this.results };
        this.extractGenres();

        // A fresh search always lands on the combined "All" view (matches
        // the mockup) - the dropdown/pill type selection only matters for
        // switching tabs afterward, not for what's shown immediately.
        this.selectedSearchTab = type;
        this.activeTab = 'all';

        setTimeout(() => {
          this.isLoading = false;
        }, 50);
      },
      error: () => {
        this.toastr.error(
          `Error occurred while searching for "${this.query}"`,
          'Error'
        );
        this.isLoading = false;
      },
    });
  }

  searchCinemaResults() {
    const query = this.query.trim();
    if (!query) return;

    (document.activeElement as HTMLElement)?.blur();

    setTimeout(() => {
      const searchBarEl = this.searchBar.nativeElement;
      const elementTop =
        searchBarEl.getBoundingClientRect().top + window.pageYOffset;
      const offsetPadding = window.innerWidth >= 768 ? 170 : 60;
      window.scrollTo({
        top: elementTop - offsetPadding,
        behavior: 'smooth',
      });
    }, 0);

    this.isLoading = true;

    if (!this.searchAttempted) {
      this.searchAttempted = true;
    }

    this.cinemaResults = [];
    this.imageLoaded.cinema = {};
    this.resultsExpanded = false;
    this.cinemaActiveTab = 'all';

    this.cinemaService.searchCinema(query).subscribe({
      next: ({ data }) => {
        this.cinemaResults = data;
        this.isLoading = false;
      },
      error: () => {
        this.toastr.error(
          `Error occurred while searching for "${this.query}"`,
          'Error'
        );
        this.isLoading = false;
      },
    });
  }

  extractGenres() {
    this.genres.songs = [
      ...new Set(
        this.results.songs
          .map((song) => song.genre as string)
          .filter((g) => g && g !== 'Unknown')
      ),
    ];

    this.genres.albums = [
      ...new Set(
        this.results.albums
          .map((album) => album.genre as string)
          .filter((g) => g && g !== 'Unknown')
      ),
    ];
  }

  toggleGenreFilter(section: 'songs' | 'albums') {
    this.showGenreDropdown[section] = !this.showGenreDropdown[section];
  }

  filterByGenre(section: 'songs' | 'albums', genre: string) {
    if (this.selectedGenre[section] === genre) {
      this.clearFilter(section); // If the same genre is clicked, remove the filter
    } else {
      this.selectedGenre[section] = genre;

      if (section === 'songs') {
        this.filteredResults.songs = this.results.songs.filter(
          (item: Song) => item.genre === genre
        );
      } else {
        this.filteredResults.albums = this.results.albums.filter(
          (item: Album) => item.genre === genre
        );
      }
    }

    this.showGenreDropdown[section] = false; // Close dropdown after selection
  }

  clearFilter(section: 'songs' | 'albums') {
    this.selectedGenre[section] = '';

    if (section === 'songs') {
      this.filteredResults.songs = [...this.results.songs];
    } else {
      this.filteredResults.albums = [...this.results.albums];
    }

    // Scroll the search bar into view
    setTimeout(() => {
      const searchBarEl = this.searchBar.nativeElement;
      const elementTop =
        searchBarEl.getBoundingClientRect().top + window.pageYOffset;
      const offset = elementTop - 110;
      window.scrollTo({ top: offset, behavior: 'smooth' });
    }, 0);
  }

  setActiveTab(tab: 'songs' | 'albums' | 'artists') {
    this.activeTab = tab;
    this.selectedSearchTab = tab;
  }

  // Switching tabs is purely client-side now (all 3 types already fetched
  // together - see onSearch) - no network call, so results expand/collapse
  // state resets to keep "View all" behavior predictable per tab.
  selectResultsTab(tab: 'all' | 'songs' | 'albums' | 'artists') {
    this.activeTab = tab;
    this.resultsExpanded = false;
  }

  toggleResultsExpanded(): void {
    this.resultsExpanded = !this.resultsExpanded;
  }

  toggleRecentSearchesExpanded(): void {
    this.recentSearchesExpanded = !this.recentSearchesExpanded;
  }

  get visibleRecentSearches(): string[] {
    return this.recentSearchesExpanded ? this.recentSearches : this.recentSearches.slice(0, 2);
  }

  // Combined preview for the "All" tab - songs first, then albums, then
  // artists (matches the order results normally get scanned in).
  get combinedAllResults(): (Song | Album | Artist)[] {
    return [
      ...this.filteredResults.songs,
      ...this.filteredResults.albums,
      ...this.filteredResults.artists,
    ];
  }

  allResultTitle(item: Song | Album | Artist): string {
    return (item as Artist).type === 'Artist' ? (item as Artist).name : (item as Song | Album).title;
  }

  allResultImage(item: Song | Album | Artist): string | null {
    return (item as Artist).type === 'Artist' ? (item as Artist).picture : (item as Song | Album).cover;
  }

  allResultSubtitle(item: Song | Album | Artist): string {
    if ((item as Artist).type === 'Artist') return 'Artist';
    if ((item as Album).type === 'Album') return `${(item as Album).artist} · Album`;
    return `${(item as Song).artist} · Song`;
  }

  allResultIsExplicit(item: Song | Album | Artist): boolean {
    return !!(item as Song | Album).isExplicit;
  }

  // Same client-side split as music's All/Songs/Albums/Artists pills - one
  // cinema search already returns both movies and TV shows together, so no
  // extra network call needed to filter by media type.
  selectCinemaTab(tab: 'all' | 'movie' | 'tv') {
    this.cinemaActiveTab = tab;
    this.resultsExpanded = false;
  }

  get cinemaMovieResults(): CinemaSearchResult[] {
    return this.cinemaResults.filter((r) => r.mediaType === 'movie');
  }

  get cinemaTvResults(): CinemaSearchResult[] {
    return this.cinemaResults.filter((r) => r.mediaType === 'tv');
  }

  get cinemaResultsForTab(): CinemaSearchResult[] {
    if (this.cinemaActiveTab === 'movie') return this.cinemaMovieResults;
    if (this.cinemaActiveTab === 'tv') return this.cinemaTvResults;
    return this.cinemaResults;
  }

  // Only controls what type the *next* search runs as - does not touch
  // `activeTab` (which drives the currently displayed results grid), so
  // switching this before searching doesn't blank out existing results.
  cycleSearchTab() {
    const order: ('songs' | 'albums' | 'artists')[] = [
      'songs',
      'albums',
      'artists',
    ];
    const next =
      order[(order.indexOf(this.selectedSearchTab) + 1) % order.length];
    this.selectedSearchTab = next;
  }

  getSearchTabIcon(tab: 'songs' | 'albums' | 'artists'): string {
    return tab === 'songs'
      ? 'fa-music'
      : tab === 'albums'
      ? 'fa-compact-disc'
      : 'fa-user';
  }

  toggleSearchType() {
    const nextType = this.searchType === 'music' ? 'cinema' : 'music';

    // Coin-flip the switch button's icon, and swap `searchType` (plus
    // everything reactive to it, including mounting the potentially-heavy
    // <app-cinema-marquee>) at the SAME invisible midpoint as the icon's own
    // image swap - not at click time (mounting the heavy marquee in the same
    // tick as the animation START left no buffer at all before the CSS
    // transform's first invisible point, so any synchronous work delayed the
    // icon-swap paint past it and the OLD icon flashed back into view), and
    // not deferred all the way to full completion either (that fixed the
    // glitch but made the new content feel laggy, arriving ~250ms after the
    // icon had already visibly landed). The 250ms mark keeps ~150ms of
    // buffer before the rotation becomes clearly visible again (50%-80% of
    // the keyframe eases back from edge-on toward face-on), which is enough
    // slack for this synchronous work in practice while still feeling
    // immediate once the icon disappears mid-flip.
    this.isFlippingSwitchIcon = true;
    setTimeout(() => {
      this.displaySearchType = nextType;
      this.searchType = nextType;

      // Reset search state so stale results from the other mode don't show
      this.query = '';
      this.lastSearchedQuery = '';
      this.searchAttempted = false;
      this.cinemaResults = [];
      this.imageLoaded.cinema = {};
      this.results = { songs: [], albums: [], artists: [] };
      this.filteredResults = { songs: [], albums: [], artists: [] };
      this.loadRecentSearches();
    }, MainSearchComponent.SWITCH_ICON_FLIP_SWAP_MS);
    setTimeout(() => {
      this.isFlippingSwitchIcon = false;
      // Subtitle text length differs between modes, which can shift the
      // search bar's position - recompute only once the flip animation has
      // fully finished. This write is layout-forcing (it sets the mobile
      // button's `top`), and doing it while the button's own icon was still
      // mid-rotateY caused Chrome to visibly glitch/repaint the button -
      // hence waiting for the same deadline as the flip itself.
      this.recomputeSwitchButtonPosition();
    }, MainSearchComponent.SWITCH_ICON_FLIP_TOTAL_MS);
  }

  ngAfterViewInit(): void {
    // Synchronous (not the setTimeout used elsewhere) so the button's
    // correct position is flushed to the DOM before the browser's first
    // paint - deferring it to a later macrotask (as toggleSearchType() and
    // the resize handler legitimately need to, since THEY react to a layout
    // change that hasn't happened yet) meant the button briefly rendered at
    // its wrong default position and visibly snapped down a moment later.
    this.recomputeSwitchButtonPosition();
    this.cdRef.detectChanges();
  }

  @HostListener('window:resize')
  onWindowResizeRecomputeSwitchButton(): void {
    this.recomputeSwitchButtonPosition();
  }

  // Vertically centers the mobile switch button between the bottom of the
  // discover tabs bar's underline and the top of the search bar, positioning
  // it absolutely relative to its own offsetParent (the heading row).
  recomputeSwitchButtonPosition(): void {
    const tabsBar = this.discoverTabsBar?.nativeElement;
    const searchBarEl = this.searchBar?.nativeElement;
    const btn = this.switchBtn?.nativeElement;
    if (!tabsBar || !searchBarEl || !btn) return;

    const tabsBottom = tabsBar.getBoundingClientRect().bottom;
    const searchBarTop = searchBarEl.getBoundingClientRect().top;
    const midpointViewportY = (tabsBottom + searchBarTop) / 2;

    const offsetParent = btn.offsetParent as HTMLElement | null;
    const parentTop = offsetParent ? offsetParent.getBoundingClientRect().top : 0;
    const btnHeight = btn.offsetHeight;

    this.switchButtonTopPx = midpointViewportY - parentTop - btnHeight / 2;
  }

  clearSearchQuery(): void {
    this.query = '';
    this.lastSearchedQuery = '';
    this.searchAttempted = false;
    this.cinemaResults = [];
    this.results = { songs: [], albums: [], artists: [] };
    this.filteredResults = { songs: [], albums: [], artists: [] };
    // Deferred - the "x" button click would otherwise steal focus back to
    // itself right after this runs, since it's still mid-click when called.
    setTimeout(() => this.searchInput?.nativeElement.focus());
  }

  // Recent Searches - persisted per-user on the backend (rides along on the
  // already-fetched profile, so switching searchType is instant/no extra request),
  // separate lists per searchType since "Nirvana" as a band search vs a movie search don't overlap.
  loadRecentSearches(): void {
    this.recentSearches = this.userProfile?.recentSearches?.[this.searchType] || [];
  }

  addRecentSearch(term: string): void {
    const existing = this.recentSearches.filter(
      (s) => s.toLowerCase() !== term.toLowerCase()
    );
    this.recentSearches = [term, ...existing].slice(0, this.RECENT_SEARCHES_LIMIT);

    this.userService.addRecentSearch(this.searchType, term).subscribe({
      error: (err) => console.error('Failed to save recent search:', err),
    });
  }

  removeRecentSearch(term: string): void {
    this.recentSearches = this.recentSearches.filter((s) => s !== term);

    this.userService.removeRecentSearch(this.searchType, term).subscribe({
      error: (err) => console.error('Failed to remove recent search:', err),
    });
  }

  clearRecentSearches(): void {
    this.recentSearches = [];

    this.userService.clearRecentSearches(this.searchType).subscribe({
      error: (err) => console.error('Failed to clear recent searches:', err),
    });
  }

  selectRecentSearch(term: string): void {
    this.query = term;
    this.searchType === 'music'
      ? this.onSearch(this.selectedSearchTab, false)
      : this.onSearch('songs');
  }

  setActiveDiscoverTab(tab: 'mainSearch' | 'popular' | 'recentActivity') {
    this.activeDiscoverTab = tab;

    // Defer scroll until after Angular paints new content
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 0);

    if (tab === 'popular') {
      this.popularImageLoaded = {
        song: {},
        album: {},
        artist: {},
      };
      this.setPopularType('Song');
    }

    if (tab === 'recentActivity') {
      this.hasMoreActivityFeed = true;
      this.activityImageLoaded = {};
      this.activeFeedType = 'Music';

      // Force feed refresh to retrigger image loading
      const cachedFeed = [...this.activityFeed];
      this.activityFeed = [];
      setTimeout(() => {
        this.activityFeed = cachedFeed;
      }, 0);

      this.loadActivityFeed();
    }
  }

  setPopularType(type: 'Song' | 'Album' | 'Artist') {
    this.isDiscoverContentLoading = true;
    this.activePopularType = type;
    this.loadPopularReviews(type);
  }

  // Filters the Feed tab by content type - 'Music' reuses the same friend-
  // activity feed the old 'Friends' option loaded; 'Cinema' loads its own
  // feed the first time it's selected, then just reuses what's cached.
  setFeedType(type: 'Music' | 'Cinema') {
    this.activeFeedType = type;
    this.isFetchingActivityFeed = false;
    this.isFetchingCinemaActivityFeed = false;
    if (type === 'Music') {
      this.activityFeed = [];
      this.activityImageLoaded = {};
      this.activityFeedCursor = null;
      this.hasMoreActivityFeed = true;
      this.loadActivityFeed();
    } else {
      this.cinemaActivityFeed = [];
      this.cinemaActivityImageLoaded = {};
      this.cinemaActivityFeedCursor = null;
      this.hasMoreCinemaActivityFeed = true;
      this.loadCinemaActivityFeed();
    }
  }

  loadPopularReviews(type: 'Song' | 'Album' | 'Artist') {
    this.reviewService.getTopReviewsByType(type).subscribe({
      next: (res) => {
        this.popularRecords = res.songs || res.albums || res.artists || [];
        this.isDiscoverContentLoading = false;

        // Step 1: Start with hidden state
        this.popularRecords.forEach((record) => {
          this.ratingDashOffsets[record.id] = 282.7;
        });

        // Step 2: Let Angular render that first state
        setTimeout(() => {
          requestAnimationFrame(() => {
            // 👇 Force one more frame to guarantee DOM paint
            requestAnimationFrame(() => {
              this.popularRecords.forEach((record) => {
                this.ratingDashOffsets[record.id] = this.calculateDashOffset(
                  record.avgRating
                );
              });
            });
          });
        }, 20); // delay needs to be long enough to break batching
      },
      error: (err) => {
        this.toastr.error('Failed to load popular reviews:', err);
        this.popularRecords = [];
        this.isDiscoverContentLoading = false;
      },
    });
  }

  loadActivityFeed() {
    if (this.isFetchingActivityFeed || !this.hasMoreActivityFeed) return;

    this.isFetchingActivityFeed = true;

    const params: any = {
      limit: this.feedPageLimit,
    };

    if (this.activityFeedCursor) {
      params.cursorDate = this.activityFeedCursor.cursorDate;
      params.cursorId = this.activityFeedCursor.cursorId;
    }

    this.reviewService.getActivityFeed(params).subscribe({
      next: (res) => {
        const currentUserId = this.userProfile?._id?.toString();

        const newReviews = (res.reviews || []).map((review) => {
          const wasAlbumTreatedAsSingle =
            review.albumSongOrArtist.wasOriginallyAlbumButTreatedAsSingle;

          return {
            ...review,
            likedByCurrentUser: currentUserId
              ? review.likedBy
                  .map((id) => id.toString())
                  .includes(currentUserId)
              : false,
            albumSongOrArtist: {
              ...review.albumSongOrArtist,
              effectiveType: wasAlbumTreatedAsSingle
                ? 'Song'
                : review.albumSongOrArtist.type,
            },
          };
        });

        this.activityFeed = [...this.activityFeed, ...newReviews];

        this.activityFeedCursor = res.nextCursor || null;
        this.hasMoreActivityFeed = !!res.nextCursor;
        this.isFetchingActivityFeed = false;
      },

      error: (err) => {
        this.toastr.error('Failed to load user activity feed', err.message);
        this.isFetchingActivityFeed = false;
      },
    });
  }

  onScrollActivityFeed() {
    if (this.hasMoreActivityFeed && !this.isFetchingActivityFeed) {
      this.loadActivityFeed();
    }
  }

  loadCinemaActivityFeed() {
    if (this.isFetchingCinemaActivityFeed || !this.hasMoreCinemaActivityFeed) return;

    this.isFetchingCinemaActivityFeed = true;

    const params: any = {
      limit: this.feedPageLimit,
    };

    if (this.cinemaActivityFeedCursor) {
      params.cursorDate = this.cinemaActivityFeedCursor.cursorDate;
      params.cursorId = this.cinemaActivityFeedCursor.cursorId;
    }

    this.cinemaService.getCinemaActivityFeed(params).subscribe({
      next: (res) => {
        const currentUserId = this.userProfile?._id?.toString();

        const newEntries: CinemaActivityEntryVm[] = (res.reviews || []).map((entry) => ({
          ...entry,
          likedByCurrentUser: currentUserId
            ? (entry.likedBy || []).map((id) => id.toString()).includes(currentUserId)
            : false,
        }));

        this.cinemaActivityFeed = [...this.cinemaActivityFeed, ...newEntries];

        this.cinemaActivityFeedCursor = res.nextCursor || null;
        this.hasMoreCinemaActivityFeed = !!res.nextCursor;
        this.isFetchingCinemaActivityFeed = false;
      },

      error: (err) => {
        this.toastr.error('Failed to load cinema activity feed', err.message);
        this.isFetchingCinemaActivityFeed = false;
      },
    });
  }

  onScrollCinemaActivityFeed() {
    if (this.hasMoreCinemaActivityFeed && !this.isFetchingCinemaActivityFeed) {
      this.loadCinemaActivityFeed();
    }
  }

  getCinemaActivityImageLoaded(i: number, type: 'cover' | 'profile'): boolean {
    return this.cinemaActivityImageLoaded[`${i}-${type}`] === true;
  }

  setCinemaActivityImageLoaded(i: number, type: 'cover' | 'profile'): void {
    this.cinemaActivityImageLoaded[`${i}-${type}`] = true;
  }

  // No-op for episode entries - episodeReviews subdocuments have no likes of
  // their own (see cinemaController.getCinemaActivityFeed), so the template
  // hides the like button for entryType 'episode' rather than calling this.
  toggleCinemaActivityLike(entry: CinemaActivityEntryVm) {
    if (!entry.itemId) return;

    this.animateCinemaHeart[entry.activityKey] = true;
    setTimeout(() => {
      this.animateCinemaHeart[entry.activityKey] = false;
    }, 300);

    const originalLiked = entry.likedByCurrentUser;
    const originalLikes = entry.likes;

    entry.likedByCurrentUser = !originalLiked;
    entry.likes += entry.likedByCurrentUser ? 1 : -1;

    this.reviewService.toggleLike(entry.itemId, 'cinema').subscribe({
      next: (res) => {
        entry.likes = res.likes;
        entry.likedByCurrentUser = res.likedByUser;
      },
      error: (err) => {
        entry.likedByCurrentUser = originalLiked;
        entry.likes = originalLikes;
        console.error('Failed to toggle like:', err);
      },
    });
  }

  // Opens the same cinema detail modal used everywhere else - episode
  // entries land on the show's overall detail page rather than deep-linking
  // into that specific episode's subview (kept simple - the feed card
  // already shows which episode was reviewed via seasonNumber/episodeNumber).
  openCinemaActivityEntry(entry: CinemaActivityEntryVm): void {
    const record: CinemaItem = {
      type: 'Cinema',
      _id: entry.itemId ?? '',
      user: entry.user._id,
      mediaType: entry.mediaType,
      tmdbId: entry.tmdbId,
      imdbId: entry.imdbId,
      title: entry.title,
      cover: entry.cover,
      isWatchlist: false,
      isWatched: true,
      isUnrefinedImport: false,
      traktSynced: false,
      createdAt: entry.activityDate,
    };

    this.openCinemaDetailModal(record);
  }

  toggleReviewExpansion(reviewId: string) {
    this.expandedReviews[reviewId] = !this.expandedReviews[reviewId];
  }


  openCinemaSearchResult(item: CinemaSearchResult): NgbModalRef {
    // Untracked stub - no CinemaItem exists yet for this search result, so
    // there's no real _id/user/rating until the user imports/tracks it.
    const record: CinemaItem = {
      type: 'Cinema',
      _id: '',
      user: '',
      mediaType: item.mediaType,
      tmdbId: item.tmdbId,
      title: item.title,
      cover: item.cover ?? undefined,
      releaseDate: item.releaseDate ?? undefined,
      isWatchlist: false,
      isWatched: false,
      isUnrefinedImport: false,
      traktSynced: false,
      createdAt: new Date().toISOString(),
    };

    return this.openCinemaDetailModal(record);
  }

  // New cinema review detail page - replaces the old ReviewPageComponent
  // modal for viewing movies/shows. "Rate" still delegates to the legacy
  // modal until this page grows its own rating UI.
  private openCinemaDetailModal(
    record: CinemaItem,
    recordList: CinemaItem[] = [record],
    index = 0
  ): NgbModalRef {
    const modalOptions: NgbModalOptions = {
      backdrop: 'static',
      keyboard: true,
      centered: true,
      scrollable: false,
      windowClass: 'cinema-detail-modal',
    };

    const modalRef = this.modal.open(CinemaReviewModalComponent, modalOptions);
    modalRef.componentInstance.record = record;
    modalRef.componentInstance.recordList = recordList;
    modalRef.componentInstance.currentIndex = index;

    modalRef.componentInstance.rate.subscribe((updatedRecord: CinemaItem) => {
      this.openCinemaRatingModal(updatedRecord, recordList, index, modalRef);
    });

    return modalRef;
  }

  // Shared cinema rate/edit-review modal (movies + shows) - see
  // cinema-rate-modal.component.ts. Mutates `record` in place on success so
  // the underlying search-result card reflects the new rating immediately
  // (same reference the list/detail modal already renders from).
  private openCinemaRatingModal(
    record: CinemaItem,
    recordList: CinemaItem[],
    index: number,
    detailsModalRef?: NgbModalRef
  ): NgbModalRef {
    const modalOptions: NgbModalOptions = {
      backdrop: 'static',
      keyboard: true,
      centered: true,
      scrollable: false,
    };

    const modalRef = this.modal.open(CinemaRateModalComponent, modalOptions);
    const instance = modalRef.componentInstance;
    instance.mode = 'cinema';
    instance.tmdbId = record.tmdbId ?? '';
    instance.mediaType = record.mediaType;
    instance.itemTitle = record.title;
    instance.cover = record.cover ?? null;
    instance.releaseDate = record.releaseDate ?? null;
    instance.displayTitle = record.title;
    instance.displayYear =
      record.mediaType === 'tv' ? record.releaseYearRange ?? null : record.releaseDate ? new Date(record.releaseDate).getFullYear() : null;
    instance.typeLabel = record.mediaType === 'movie' ? 'Movie' : 'TV Show';
    instance.genres = record.genres ?? [];
    instance.initialRating = record.decimalRating ?? null;
    instance.initialReviewText = record.reviewText ?? '';
    instance.initialContainsSpoilers = record.containsSpoilers ?? false;

    modalRef.result.then(
      (result) => {
        if (!result) return;
        record.decimalRating = result.decimalRating;
        record.reviewText = result.reviewText;
        record.containsSpoilers = result.containsSpoilers;
        record.isWatchlist = false;
        record.isWatched = true;
        record.isUnrefinedImport = false;
        detailsModalRef?.componentInstance.refreshAfterRating();
      },
      () => {}
    );

    return modalRef;
  }

  openModal(
    record: ModalRecord,
    recordList?: ModalRecord[],
    index?: number
  ): NgbModalRef {
    const modalOptions: NgbModalOptions = {
      backdrop: 'static',
      keyboard: true,
      centered: true,
      scrollable: false,
    };

    const modalRef = this.modal.open(ReviewPageComponent, modalOptions);
    modalRef.componentInstance.activeDiscoverTab = this.activeDiscoverTab;

    // Use passed list/index if available
    if (recordList && index !== undefined) {
      modalRef.componentInstance.recordList = recordList;
      modalRef.componentInstance.currentIndex = index;
    } else {
      // Fallback for main search
      if (record.type === 'Song') {
        const idx = this.filteredResults.songs.findIndex((s) => s === record);
        modalRef.componentInstance.recordList = this.filteredResults.songs;
        modalRef.componentInstance.currentIndex = idx;
      }

      if (record.type === 'Album') {
        const idx = this.filteredResults.albums.findIndex((a) => a === record);
        modalRef.componentInstance.recordList = this.filteredResults.albums;
        modalRef.componentInstance.currentIndex = idx;
      }

      if (record.type === 'Artist') {
        const idx = this.filteredResults.artists.findIndex((a) => a === record);
        modalRef.componentInstance.recordList = this.filteredResults.artists;
        modalRef.componentInstance.currentIndex = idx;
      }
    }

    modalRef.componentInstance.record = record;

    // 1. Handle when a review is created
    modalRef.componentInstance.reviewCreated?.subscribe((newReview: Review) => {
      const wasAlbumTreatedAsSingle =
        newReview.albumSongOrArtist?.wasOriginallyAlbumButTreatedAsSingle;

      const transformedReview = {
        ...newReview,
        albumSongOrArtist: {
          ...newReview.albumSongOrArtist,
          effectiveType: wasAlbumTreatedAsSingle
            ? 'Song'
            : newReview.albumSongOrArtist?.type || 'unknown',
        },
      };

      this.activityFeed.unshift(transformedReview);
    });

    // 2. Handle when a review is deleted
    modalRef.componentInstance.reviewDeleted?.subscribe(
      (deletedReview: Review) => {
        this.activityFeed = this.activityFeed.filter(
          (review) => review._id !== deletedReview._id
        );
      }
    );
    // 3. Handle when a review is edited
    modalRef.componentInstance.reviewEdited.subscribe(
      (updatedReview: Review) => {
        const i = this.activityFeed.findIndex(
          (a) => a._id === updatedReview._id
        );
        if (i !== -1) {
          const updated = {
            ...this.activityFeed[i],
            reviewText: updatedReview.reviewText,
            rating: updatedReview.rating,
            createdAt: updatedReview.createdAt,
          };

          this.activityFeed.splice(i, 1); // remove old position
          this.activityFeed.unshift(updated); // insert at top
        }
        if (this.activeDiscoverTab === 'popular') {
          this.loadPopularReviews(this.activePopularType);
        }
      }
    );

    // 5. Handle opening a song or album from an artist or album review
    modalRef.componentInstance.openNewReview.subscribe(
      (record: Song | Album) => {
        if (!('type' in record) || !record.type) {
          (record as Album).type = 'Album';
        }

        modalRef.componentInstance.showSecondIpod = false;
        modalRef.componentInstance.record = record;
        modalRef.componentInstance.recordList = [record];
        modalRef.componentInstance.currentIndex = 0;
        modalRef.componentInstance.showForwardAndBackwardButtons = false;

        // Reset state to mimic a fresh open
        modalRef.componentInstance.resetForNewRecord();

        setTimeout(() => {
          modalRef.componentInstance.modalScrollContainer?.nativeElement?.scrollTo(
            {
              top: 0,
              behavior: 'auto',
            }
          );
        });
      }
    );

    return modalRef;
  }

  get activityRecords(): ActivityRecord[] {
    return this.activityFeed.map((a) => a.albumSongOrArtist);
  }

  getHighQualityImage(imageUrl: string): string {
    if (!imageUrl) return '';

    // Ensure we're requesting the highest resolution available
    if (imageUrl.includes('api.deezer.com')) {
      return `${imageUrl}?size=xl`;
    }

    return imageUrl;
  }

  resultsHasValues() {
    return (
      !!this.results &&
      (this.results.songs?.length > 0 ||
        this.results.artists?.length > 0 ||
        this.results.albums?.length > 0)
    );
  }

  closeModal() {
    this.isModalOpen = false;
    this.selectedRecord = null;
  }

  goToUserProfile(userId: string) {
    this.router.navigate(['/profile', userId], {
      state: { section: 'recentActivity' },
    });
  }

  getPopularTypeIndex(): number {
    return this.popularTypes.indexOf(this.activePopularType);
  }

  getPopularKey(): 'song' | 'album' | 'artist' {
    const type = this.activePopularType.toLowerCase();
    if (type === 'song' || type === 'album' || type === 'artist') {
      return type;
    }
    return 'song'; // fallback
  }

  getActivityImageLoaded(i: number, type: 'cover' | 'profile'): boolean {
    return this.activityImageLoaded[`${i}-${type}`] === true;
  }

  setActivityImageLoaded(i: number, type: 'cover' | 'profile'): void {
    this.activityImageLoaded[`${i}-${type}`] = true;
  }

  // Simple date-string compare (no live TMDb call needed) - releaseDate is
  // already returned for every cinema search result, so this is free.
  isComingSoon(releaseDate?: string | null): boolean {
    if (!releaseDate) return false;
    const todayStr = new Date().toISOString().slice(0, 10);
    return releaseDate.slice(0, 10) > todayStr;
  }

  // Same badge logic/priority/icons as everywhere else (see shared/cinema-status-badge.ts).
  cinemaBadge(item: CinemaSearchResult): CinemaBadgeVm | null {
    return getCinemaStatusBadge(item);
  }

  toggleLike(review: Review) {
    // 1. Trigger the animation
    this.animateHeart[review._id] = true;

    // 2. Stop animation after 300ms
    setTimeout(() => {
      this.animateHeart[review._id] = false;
    }, 300);

    const originalLiked = review.likedByCurrentUser ?? false;
    const originalLikes = review.likes;

    review.likedByCurrentUser = !originalLiked;
    review.likes += review.likedByCurrentUser ? 1 : -1;

    this.reviewService.toggleLike(review._id).subscribe({
      next: (res) => {
        review.likes = res.likes;
        review.likedByCurrentUser = res.likedByUser;
      },
      error: (err) => {
        review.likedByCurrentUser = originalLiked;
        review.likes = originalLikes;
        console.error('Failed to toggle like:', err);
      },
    });
  }

  transformCloudinaryUrl(url: string): string {
    // Ensure this logic only applies to Cloudinary URLs
    if (!url.includes('res.cloudinary.com')) return url;

    return url.replace(
      /\/upload\//,
      '/upload/w_1600,h_1600,c_fill,g_face,f_auto,q_auto,dpr_auto/'
    );
  }

  calculateDashOffset(rating: number): number {
    const maxCircumference = 2 * Math.PI * 45; // 45 = r (matches the popular-ring-progress circle)
    const percent = Math.min(Math.max(rating, 0), 10) / 10;
    return +(maxCircumference * (1 - percent)).toFixed(1);
  }
}
