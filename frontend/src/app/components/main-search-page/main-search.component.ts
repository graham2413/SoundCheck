import {
  Component,
  ElementRef,
  HostListener,
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
import {
  GetReleasesResponse,
  Release,
} from 'src/app/models/responses/release-response';
import { InfiniteScrollDirective } from 'ngx-infinite-scroll';
import { SpotifyService } from 'src/app/services/spotify.service';

type ActivityRecord = Review['albumSongOrArtist'];
type ModalRecord = Song | Album | Artist | PopularRecord | ActivityRecord;
@Component({
  selector: 'app-main-search',
  templateUrl: './main-search.component.html',
  styleUrls: ['./main-search.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, TimeAgoPipe, InfiniteScrollDirective],
})
export class MainSearchComponent implements OnInit {
  @ViewChild('searchBar') searchBar!: ElementRef<HTMLDivElement>;

  @ViewChild('dropdownContainer') dropdownContainer!: ElementRef;
  @ViewChild('filterButton') filterButton!: ElementRef;

  query: string = '';
  isLoading: boolean = false;
  activeTab: 'songs' | 'albums' | 'artists' = 'songs';
  activeDiscoverTab: 'mainSearch' | 'popular' | 'recentActivity' = 'mainSearch';
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

  isMarqueeLoading = true;
  popularRecords: PopularRecord[] = [];
  expandedReviews: { [reviewId: string]: boolean } = {};
  activePopularType: 'Song' | 'Album' | 'Artist' = 'Song';
  readonly popularTypes: Array<'Song' | 'Album' | 'Artist'> = [
    'Song',
    'Album',
    'Artist',
  ];
  activeFeedType: 'Friends' | 'Artists' = 'Friends';
  readonly activityFeedTypes: Array<'Friends' | 'Artists'> = [
    'Friends',
    'Artists',
  ];
  isDiscoverContentLoading: boolean = false;
  isFetchingArtistFeed: boolean = false;
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

  artistFeed: Release[] = [];
  artistFeedCursor: { cursorDate: string; cursorId: string } | null = null;
  hasMoreArtistFeed: boolean = true;
  feedPageLimit: number = 20;

  activityFeedCursor: { cursorDate: string; cursorId: string } | null = null;
  hasMoreActivityFeed: boolean = true;
  isFetchingActivityFeed: boolean = false;

  albums: any[] = [];
  skeletonArray = Array(10);
  @ViewChild('marqueeContainer') marqueeContainer!: ElementRef;
  imageLoaded = {
    songs: {} as { [index: number]: boolean },
    albums: {} as { [index: number]: boolean },
    artists: {} as { [index: number]: boolean },
  };

  popularImageLoaded = {
    song: {} as { [index: number]: boolean },
    album: {} as { [index: number]: boolean },
    artist: {} as { [index: number]: boolean },
  };

  activityImageLoaded: { [key: string]: boolean } = {};
  artistImageLoaded: { [index: number]: boolean } = {};

  constructor(
    private searchService: SearchService,
    private modal: NgbModal,
    private toastr: ToastrService,
    private reviewService: ReviewService,
    private router: Router,
    private userService: UserService,
    private timeAgoPipe: TimeAgoPipe,
    private spotifyService: SpotifyService
  ) {}

  async ngOnInit(): Promise<void> {
    const stored = localStorage.getItem('albumImages');
    let shouldRefetch = true;

    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const cachedAt = parsed.cachedAt || 0;
        const lastFridayNoon = this.getLastFridayNoon();

        if (cachedAt >= lastFridayNoon) {
          shouldRefetch = false; // Cache is fresh
        }
      } catch (e) {
        console.warn('Failed to parse cached albumImages:', e);
      }
    }

    if (shouldRefetch) {
      await this.fetchAndStoreAlbums();
    }

    await this.setMarquee();
    this.setUserProfile();

    this.section = history.state.section || null;

    if (
      this.section === 'mainSearch' ||
      this.section === 'popular' ||
      this.section === 'recentActivity'
    ) {
      this.setActiveDiscoverTab(this.section);
    }
  }

  async setMarquee() {
    this.isMarqueeLoading = true;
    const storedAlbums = localStorage.getItem('albumImages');
    let baseAlbums: any[] = [];

    if (storedAlbums) {
      try {
        const parsed = JSON.parse(storedAlbums);
        baseAlbums = parsed.albums || [];
        baseAlbums = baseAlbums.map((album) => ({
          ...album,
          cover: this.getHighQualityImage(album.cover),
        }));
      } catch (e) {
        console.error('Error parsing stored album images:', e);
      }
    }

    if (baseAlbums.length === 0) {
      // fallback defaults
      baseAlbums = Array.from({ length: 10 }, (_, i) => ({
        id: i,
        title: `Static Album ${i + 1}`,
        artist: 'Unknown',
        cover: `assets/album${i + 1}.jpg`,
      }));
    }

    await this.preloadImages(baseAlbums);

    this.albums = baseAlbums;
    this.isMarqueeLoading = false;
  }

  getLastFridayNoon(): number {
    const now = new Date();
    const day = now.getDay(); // 0 = Sunday, 5 = Friday
    const daysSinceFriday = day >= 5 ? day - 5 : 7 - (5 - day);
    const lastFriday = new Date(now);
    lastFriday.setDate(now.getDate() - daysSinceFriday);
    lastFriday.setHours(12, 0, 0, 0); // set to 12:00 PM Friday
    return lastFriday.getTime();
  }

  preloadImages(albums: any[]): Promise<void> {
    return new Promise((resolve) => {
      let loadedCount = 0;

      if (albums.length === 0) {
        resolve();
        return;
      }

      for (let album of albums) {
        const img = new Image();
        img.onload = img.onerror = () => {
          loadedCount++;
          if (loadedCount === albums.length) {
            resolve();
          }
        };
        img.src = album.cover;
      }
    });
  }

  fetchAndStoreAlbums(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.spotifyService.getAlbumImages().subscribe({
        next: (data) => {
          localStorage.setItem(
            'albumImages',
            JSON.stringify({
              albums: data.albums,
              cachedAt: Date.now(),
            })
          );
          resolve();
        },
        error: (err) => {
          console.error('Failed to fetch album images:', err);
          resolve(); // Still resolve so app doesn’t hang
        },
      });
    });
  }

  setUserProfile() {
    // Subscribes to updates from the user profile observable
    this.userService.userProfile$.subscribe((profile) => {
      if (profile) {
        this.userProfile = profile;
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

    (document.activeElement as HTMLElement)?.blur();

    setTimeout(() => {
      const searchBarEl = this.searchBar.nativeElement;
      const elementTop =
        searchBarEl.getBoundingClientRect().top + window.pageYOffset;
      const offset = elementTop - 105;
      window.scrollTo({ top: offset, behavior: 'smooth' });
    }, 0);

    this.isLoading = true;

    if (!this.searchAttempted) {
      this.searchAttempted = true;
    }

    this.results = { songs: [], albums: [], artists: [] };
    this.filteredResults = { songs: [], albums: [], artists: [] };

    this.imageLoaded = {
      songs: {},
      albums: {},
      artists: {},
    };

    const fallbackOrder: ('songs' | 'albums' | 'artists')[] = [
      'songs',
      'albums',
      'artists',
    ];
    const startIndex = fallbackOrder.indexOf(type);

    if (!useFallback) {
      // Manual search: only search for the requested type
      this.setActiveTab(type);
      this.searchService.searchMusic(this.query, type).subscribe({
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

          if (type !== 'artists') {
            this.extractGenres();
          }

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
      return;
    }

    // Smart fallback search
    const attemptSearch = (i: number) => {
      if (i >= fallbackOrder.length) {
        this.isLoading = false;
        return;
      }

      const currentType = fallbackOrder[i];
      this.searchService.searchMusic(this.query, currentType).subscribe({
        next: (data: SearchResponse) => {
          const isEmpty =
            (!data.songs?.length && currentType === 'songs') ||
            (!data.albums?.length && currentType === 'albums') ||
            (!data.artists?.length && currentType === 'artists');

          if (isEmpty) {
            attemptSearch(i + 1); // fallback to next
            return;
          }

          // We have results, switch to that tab
          this.setActiveTab(currentType);

          this.results = {
            ...this.results,
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
          this.imageLoaded = { songs: {}, albums: {}, artists: {} };

          if (currentType !== 'artists') {
            this.extractGenres();
          }

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
    };

    attemptSearch(startIndex);
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
  }

  setActiveDiscoverTab(tab: 'mainSearch' | 'popular' | 'recentActivity') {
    this.activeDiscoverTab = tab;

    if (tab === 'popular') {
      this.popularImageLoaded = {
        song: {},
        album: {},
        artist: {},
      };
      this.setPopularType('Song');
      this.loadPopularReviews('Song');
    }
    if (tab === 'recentActivity') {
      this.hasMoreActivityFeed = true;
      this.artistImageLoaded = {};
      this.activityImageLoaded = {};
      this.activeFeedType = 'Friends';
      this.loadActivityFeed();
    }
  }

  setPopularType(type: 'Song' | 'Album' | 'Artist') {
    this.isDiscoverContentLoading = true;
    this.activePopularType = type;
    this.loadPopularReviews(type);
  }

  setFeedType(type: 'Friends' | 'Artists') {
    this.activeFeedType = type;
    if (type === 'Artists') {
      this.artistFeed = [];
      this.activityImageLoaded = {};
      this.artistFeedCursor = null;
      this.hasMoreArtistFeed = true;
      this.loadArtistsFeed();
    }
    if (type === 'Friends') {
      this.activityFeed = [];
      this.activityImageLoaded = {};
      this.activityFeedCursor = null;
      this.hasMoreActivityFeed = true;
      this.loadActivityFeed();
    }
  }

  loadArtistsFeed() {
    const artistList = this.userProfile.artistList;

    if (!artistList || artistList.length === 0) {
      // Retry once after delay
      setTimeout(() => {
        if (
          this.userProfile.artistList &&
          this.userProfile.artistList.length > 0
        ) {
          this.loadArtistsFeed();
        } else {
          this.isFetchingArtistFeed = false;
          this.artistFeed = [];
        }
      }, 200); // adjust delay as needed
      return;
    }

    const artistIds = artistList.map((artist) => artist.id).filter(Boolean);
    if (artistIds.length === 0) {
      this.isFetchingArtistFeed = false;
      this.artistFeed = [];
      this.hasMoreArtistFeed = false;
      return;
    }

    this.getArtistFeed(artistIds, undefined, undefined);
  }

  loadMoreArtistsFeed() {
    if (!this.hasMoreArtistFeed || !this.artistFeedCursor) return;

    const artistIds = this.userProfile.artistList
      ?.map((a) => a.id)
      .filter(Boolean);
    if (!artistIds?.length) return;

    const { cursorDate, cursorId } = this.artistFeedCursor;

    this.getArtistFeed(artistIds, cursorDate, cursorId);
  }

  getArtistFeed(artistIds: string[], cursorDate?: string, cursorId?: string) {
    this.isFetchingArtistFeed = true;

    this.searchService
      .getReleasesByArtistIds(
        artistIds,
        this.feedPageLimit,
        cursorDate,
        cursorId
      )
      .subscribe({
        next: (res: GetReleasesResponse) => {
          const newReleases = (res?.releases || []).map((release) => ({
            ...release,
            cover: this.getHighQualityImage(release.cover),
          }));

          this.artistFeed = cursorDate
            ? [...this.artistFeed, ...newReleases] // pagination
            : newReleases; // initial load
          this.artistFeedCursor = res.nextCursor || null;
          this.hasMoreArtistFeed = !!res.nextCursor;
          this.isFetchingArtistFeed = false;
        },
        error: (err) => {
          this.toastr.error('Failed to load artists feed:', err.message || err);
          this.artistFeed = [];
          this.isFetchingArtistFeed = false;
          this.hasMoreArtistFeed = false;
        },
      });
  }

  loadPopularReviews(type: 'Song' | 'Album' | 'Artist') {
    this.reviewService.getTopReviewsByType(type).subscribe({
      next: (res) => {
        this.popularRecords = res.songs || res.albums || res.artists || [];
        setTimeout(() => {
          this.isDiscoverContentLoading = false;
        }, 250);
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
        const newReviews = (res.reviews || []).map((review) => {
          const wasAlbumTreatedAsSingle =
            review.albumSongOrArtist.wasOriginallyAlbumButTreatedAsSingle;

          return {
            ...review,
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

  toggleReviewExpansion(reviewId: string) {
    this.expandedReviews[reviewId] = !this.expandedReviews[reviewId];
  }

  transformReleaseToModalRecord(release: Release): PopularRecord {
    return {
      id: Number(release.albumId),
      type: 'Album',
      title: release.title,
      artist: release.artistName,
      cover: release.cover,
      isExplicit: release.isExplicit,
      releaseDate: release.releaseDate,
      avgRating: 0,
      reviewCount: 0,
    };
  }

  openModal(
    record: ModalRecord,
    recordList?: ModalRecord[],
    index?: number
  ): NgbModalRef {
    const modalOptions: NgbModalOptions = {
      backdrop: false,
      keyboard: true,
      centered: true,
      scrollable: true,
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

        const newModal = this.openModal(record, [], 0);
        newModal.componentInstance.showForwardAndBackwardButtons = false; // Hide buttons for this modal
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

  getActiveSearchTabIndex(): number {
    const order: ('songs' | 'albums' | 'artists')[] = [
      'songs',
      'albums',
      'artists',
    ];
    return order.indexOf(this.activeTab);
  }

  getReleaseLabel(releaseDate: string | Date): string {
    const date = new Date(releaseDate);
    const now = new Date();

    const diff = date.getTime() - now.getTime();
    const days = Math.round(diff / (1000 * 60 * 60 * 24));

    if (diff > 0) {
      // Future release
      if (days <= 7) {
        return `Releases in ${days} day${days !== 1 ? 's' : ''}`;
      } else {
        return `Coming ${date.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year:
            date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
        })}`;
      }
    } else {
      // Past release
      return `Released ${this.timeAgoPipe.transform(releaseDate)}`;
    }
  }
}
