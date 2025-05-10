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
type ActivityRecord = Review['albumSongOrArtist'];
type ModalRecord = Song | Album | Artist | PopularRecord | ActivityRecord;
@Component({
  selector: 'app-main-search',
  templateUrl: './main-search.component.html',
  styleUrls: ['./main-search.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, TimeAgoPipe],
})
export class MainSearchComponent implements OnInit {
  @ViewChild('marqueeContainer') marqueeContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('marqueeTrack') marqueeTrack!: ElementRef<HTMLDivElement>;
  @ViewChild('searchBar') searchBar!: ElementRef<HTMLDivElement>;

  @ViewChild('dropdownContainer') dropdownContainer!: ElementRef;
  @ViewChild('filterButton') filterButton!: ElementRef;

  query: string = '';
  isLoading: boolean = false;
  activeTab: 'songs' | 'albums' | 'artists' = 'songs';
  activeDiscoverTab: 'mainSearch' | 'popular' | 'recentActivity' = 'mainSearch';
  private trackX = 0;
  private speed = 0.8;
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

  skeletonArray = Array(15).fill(0);
  isMarqueeLoading = true;
  popularRecords: PopularRecord[] = [];
  expandedReviews: { [reviewId: string]: boolean } = {};
  activePopularType: 'Song' | 'Album' | 'Artist' = 'Song';
  readonly popularTypes: Array<'Song' | 'Album' | 'Artist'> = [
    'Song',
    'Album',
    'Artist',
  ];
  isDiscoverContentLoading: boolean = false;
  isActivityLoading: boolean = false;
  activityFeed: Review[] = [];
  section: string | null = null;

  constructor(
    private searchService: SearchService,
    private modal: NgbModal,
    private toastr: ToastrService,
    private reviewService: ReviewService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.section = history.state.section || null;

    if (
      this.section === 'mainSearch' ||
      this.section === 'popular' ||
      this.section === 'recentActivity'
    ) {
      this.setActiveDiscoverTab(this.section);
    }
  }

  ngAfterViewInit(): void {
    this.isMarqueeLoading = true;
    this.loadAlbumImages();
    requestAnimationFrame(() => this.animateMarquee());
  }

  @HostListener('document:click', ['$event'])
  clickOutside(event: Event) {
    const clickedInsideDropdown =
      this.dropdownContainer?.nativeElement.contains(event.target);
    const clickedFilterButton = this.filterButton?.nativeElement.contains(
      event.target
    );

    if (clickedInsideDropdown || clickedFilterButton) {
      return; // Do nothing
    }

    this.showGenreDropdown = { songs: false, albums: false };
  }

  private loadAlbumImages() {
    this.isMarqueeLoading = true; // trigger skeletons

    const trackEl = this.marqueeTrack.nativeElement;
    const storedAlbums = localStorage.getItem('albumImages');

    let albums: Album[] = [];

    if (storedAlbums) {
      try {
        albums = JSON.parse(storedAlbums).albums || [];
      } catch (error) {
        console.error('Error parsing stored album images:', error);
        albums = [];
      }
    }

    if (albums.length === 0) {
      albums = Array.from({ length: 15 }, (_, i) => ({
        id: i + 1,
        title: `Static Album ${i + 1}`,
        artist: 'Unknown',
        cover: `assets/album${i + 1}.jpg`,
        releaseDate: '',
        tracklist: [],
        genre: '',
        type: 'Album',
        isExplicit: false,
        preview: '',
      }));
    }

    // Delay to simulate loading
    setTimeout(() => {
      albums.forEach((album, index) => {
        // Transform the cover once
        const highQualityCover = this.getHighQualityImage(album.cover);
        album.cover = highQualityCover; // update it on the album object

        // Create image element
        const imgEl = document.createElement('img');
        imgEl.src = highQualityCover;
        imgEl.alt = album.title;
        imgEl.className = 'w-[10rem] h-[10rem] md:w-[15rem] md:h-[15rem] object-cover mr-4 rounded cursor-pointer';

        // Click opens modal with updated album.cover
        imgEl.addEventListener('click', () => {
          this.openModal(album, albums, index);
        });

        trackEl.appendChild(imgEl);
      });

      this.isMarqueeLoading = false;
      this.initializeMarquee();
    }, 500); // show skeletons for 0.5s
  }

  private initializeMarquee() {
    const containerEl = this.marqueeContainer.nativeElement;
    const trackEl = this.marqueeTrack.nativeElement;

    // Original images
    const originalImages = Array.from(trackEl.children) as HTMLImageElement[];

    const getTrackWidth = () => trackEl.scrollWidth;
    const getContainerWidth = () => containerEl.offsetWidth;

    // Keep duplicating until track is >= 2x container width
    let cloneCount = 0;
    while (getTrackWidth() < getContainerWidth() * 2 && cloneCount < 10) {
      for (const img of originalImages) {
        const clone = img.cloneNode(true) as HTMLImageElement;
        trackEl.appendChild(clone);
      }
      cloneCount++;
    }
  }

  private animateMarquee() {
    const trackEl = this.marqueeTrack.nativeElement;
    this.trackX -= this.speed;

    // Check if the first child is fully off-screen
    const firstImg = trackEl.firstElementChild as HTMLImageElement | null;
    if (firstImg) {
      const firstImgWidth =
        firstImg.offsetWidth + this.getMarginRight(firstImg);
      if (Math.abs(this.trackX) >= firstImgWidth) {
        // remove from the front
        trackEl.removeChild(firstImg);
        // append to the end
        trackEl.appendChild(firstImg);
        // adjust trackX to avoid jump
        this.trackX += firstImgWidth;
      }
    }

    trackEl.style.transform = `translateX(${this.trackX}px)`;
    requestAnimationFrame(() => this.animateMarquee());
  }

  // Helper to read the margin-right from computed style
  private getMarginRight(el: HTMLElement): number {
    const style = window.getComputedStyle(el);
    return parseFloat(style.marginRight || '0');
  }

  onSearch(type: 'songs' | 'albums' | 'artists') {
    const query = this.query.trim();
    if (!query) return;

    (document.activeElement as HTMLElement)?.blur();

    // Scroll the search bar into view
    setTimeout(() => {
      const searchBarEl = this.searchBar.nativeElement;
      const elementTop =
        searchBarEl.getBoundingClientRect().top + window.pageYOffset;
      const offset = elementTop - 105;
      window.scrollTo({ top: offset, behavior: 'smooth' });
    }, 0);

    this.isLoading = true;
    this.searchAttempted = true;

    // Clear previous results
    this.results = { songs: [], albums: [], artists: [] };
    this.filteredResults = { songs: [], albums: [], artists: [] };

    this.searchService.searchMusic(this.query, type).subscribe({
      next: (data: SearchResponse) => {
        // Enhance images for better quality before storing results
        this.results = {
          ...this.results, // Preserve previously loaded data (important for lazy loading!)
          songs: data.songs
            ? data.songs.map((song: Song) => ({
                ...song,
                cover: this.getHighQualityImage(song.cover),
                type: 'Song' as const,
              }))
            : this.results.songs,

          albums: data.albums
            ? data.albums.map((album: Album) => ({
                ...album,
                cover: this.getHighQualityImage(album.cover),
                type: 'Album' as const,
              }))
            : this.results.albums,

          artists: data.artists
            ? data.artists.map((artist: Artist) => ({
                ...artist,
                picture: this.getHighQualityImage(artist.picture),
                type: 'Artist' as const,
              }))
            : this.results.artists,
        };

        this.filteredResults = { ...this.results };

        if (type !== 'artists') {
          this.extractGenres();
        }

        // Allow images to load
        setTimeout(() => {
          this.setActiveTab(type);
          this.isLoading = false;
        }, 50);
      },
      error: (error) => {
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
  }

  setActiveDiscoverTab(tab: 'mainSearch' | 'popular' | 'recentActivity') {
    this.activeDiscoverTab = tab;

    if (tab === 'popular') {
      this.setPopularType('Song');
      this.loadPopularReviews('Song');
    }
    if (tab === 'recentActivity') {
      this.loadAcitivityFeed();
    }
  }

  setPopularType(type: 'Song' | 'Album' | 'Artist') {
    this.isDiscoverContentLoading = true;
    this.activePopularType = type;
    this.loadPopularReviews(type);
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

  loadAcitivityFeed() {
    this.isActivityLoading = true;
    this.reviewService.getActivityFeed().subscribe({
      next: (res) => {
        this.activityFeed = res.reviews || [];

        setTimeout(() => {
          this.isActivityLoading = false;
        }, 250);
      },
      error: (err) => {
        this.activityFeed = [];
        this.toastr.error('Failed to load User activity feed:', err);
        this.isActivityLoading = false;
      },
    });
  }

  toggleReviewExpansion(reviewId: string) {
    this.expandedReviews[reviewId] = !this.expandedReviews[reviewId];
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
      this.activityFeed.unshift(newReview); // Add new review at top
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

    // 4. Handle opening a song frmo an artist or album review
    modalRef.componentInstance.openNewReview.subscribe((record: Song) => {
      // Upgrade the image before opening the modal
      const highResCover = this.getHighQualityImage(record.cover);
      const updatedRecord = { ...record, cover: highResCover };

      const newModal = this.openModal(updatedRecord, [], 0);
      newModal.componentInstance.showForwardAndBackwardButtons = false; // Hide buttons for this modal
      modalRef.close();
    });
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
}
