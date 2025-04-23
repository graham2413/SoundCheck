import { Component, ElementRef, HostListener, ViewChild } from '@angular/core';
import { NgbModal, NgbModalOptions } from '@ng-bootstrap/ng-bootstrap';
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

@Component({
  selector: 'app-main-search',
  templateUrl: './main-search.component.html',
  styleUrls: ['./main-search.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, TimeAgoPipe]
})
export class MainSearchComponent {
  @ViewChild('marqueeContainer') marqueeContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('marqueeTrack') marqueeTrack!: ElementRef<HTMLDivElement>;
  @ViewChild('searchBar') searchBar!: ElementRef<HTMLDivElement>;

  @ViewChild('dropdownContainer') dropdownContainer!: ElementRef;
  @ViewChild('filterButton') filterButton!: ElementRef

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
  genres = { songs: [] as string[], albums: [] as string[], artists: [] as string[] };

  selectedGenre = { songs: '', albums: '' };

  // API results
  results: { songs: Song[]; albums: Album[]; artists: Artist[] } = { songs: [], albums: [], artists: [] };

  // Filtered results to store only matching genres
  filteredResults: { songs: Song[]; albums: Album[]; artists: Artist[] } = { songs: [], albums: [], artists: [] };

  skeletonArray = Array(15).fill(0);
  isMarqueeLoading = true;
  popularRecords: any[] = [];
  expandedReviews: { [reviewId: string]: boolean } = {};
  activePopularType: 'Song' | 'Album' | 'Artist' = 'Song';
  readonly popularTypes: Array<'Song' | 'Album' | 'Artist'> = ['Song', 'Album', 'Artist'];
  isDiscoverContentLoading: boolean = false;
  isActivityLoading: boolean = false;
  activityFeed: any[] = [];

  constructor(private searchService: SearchService,
    private modal: NgbModal,
    private toastr: ToastrService,
    private reviewService: ReviewService,
    private router: Router
  ) { }

  ngAfterViewInit(): void {
    this.isMarqueeLoading = true;
    this.loadAlbumImages();
    requestAnimationFrame(() => this.animateMarquee());
  }

  @HostListener('document:click', ['$event'])
  clickOutside(event: Event) {
    const clickedInsideDropdown = this.dropdownContainer?.nativeElement.contains(event.target);
    const clickedFilterButton = this.filterButton?.nativeElement.contains(event.target);

    if (clickedInsideDropdown || clickedFilterButton) {
      return; // Do nothing
    }

    this.showGenreDropdown = { songs: false, albums: false };
  }

  private loadAlbumImages() {
    this.isMarqueeLoading = true; // trigger skeletons
  
    const trackEl = this.marqueeTrack.nativeElement;
    const storedAlbums = localStorage.getItem("albumImages");
  
    let albums: any[] = [];
  
    if (storedAlbums) {
      try {
        albums = JSON.parse(storedAlbums).albums || [];
      } catch (error) {
        console.error("Error parsing stored album images:", error);
        albums = [];
      }
    }
  
    if (albums.length === 0) {
      albums = Array.from({ length: 15 }, (_, i) => ({
        imageUrl: `assets/album${i + 1}.jpg`,
        name: `Static Album ${i + 1}`
      }));
    }
  
    // Delay to simulate loading
    setTimeout(() => {
      albums.forEach((album) => {
        const imgEl = document.createElement("img");
        imgEl.src = album.imageUrl;
        imgEl.alt = album.name;
        imgEl.className =
          "w-[10rem] h-[10rem] md:w-[15rem] md:h-[15rem] object-cover mr-4 rounded";
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

  onSearch() {
    if (!this.query.trim()) return;

    (document.activeElement as HTMLElement)?.blur();

    // Scroll the search bar into view
    setTimeout(() => {
      const searchBarEl = this.searchBar.nativeElement;
      const elementTop =
        searchBarEl.getBoundingClientRect().top + window.pageYOffset;
      const offset = elementTop - 15;
      window.scrollTo({ top: offset, behavior: 'smooth' });
    }, 0);

    this.isLoading = true;
    this.searchAttempted = true;

    this.searchService.searchMusic(this.query).subscribe({
      next: (data: SearchResponse) => {
        // Enhance images for better quality before storing results
        this.results = {
          ...data,
          songs: data.songs.map((song: Song) => ({
            ...song,
            cover: this.getHighQualityImage(song.cover),
            type: 'Song' as const,
          })),
          albums: data.albums.map((album: Album) => ({
            ...album,
            cover: this.getHighQualityImage(album.cover),
            type: 'Album' as const,
          })),
          artists: data.artists.map((artist: Artist) => ({
            ...artist,
            picture: this.getHighQualityImage(artist.picture),
            type: 'Artist' as const,
          })),
        };
      

        this.filteredResults = { ...this.results };

        this.extractGenres();

        // Allow images to load
        setTimeout(() => {
          this.setActiveTab('songs');
          this.isLoading = false;
        }, 250);
      },
      error: (error) => {
        this.toastr.error(`Error occurred while searching for "${this.query}"`, 'Error');
        this.isLoading = false;
      },
    });
  }

  extractGenres() {
    this.genres.songs = [...new Set(
      this.results.songs
        .map(song => song.genre as string)
        .filter(g => g && g !== 'Unknown')
    )];

    this.genres.albums = [...new Set(
      this.results.albums
        .map(album => album.genre as string)
        .filter(g => g && g !== 'Unknown')
    )];
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
        this.filteredResults.songs = this.results.songs.filter((item: Song) => item.genre === genre);
      } else {
        this.filteredResults.albums = this.results.albums.filter((item: Album) => item.genre === genre);
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

    if(tab === 'popular') {
      this.setPopularType('Song')
      this.loadPopularReviews('Song');
    }
    if(tab === 'recentActivity') {
      this.loadAcitivityFeed();
    }
  }

  setPopularType(type: 'Song' | 'Album' | 'Artist') {
    this.isDiscoverContentLoading = true;
    if (type !== this.activePopularType) {
      this.activePopularType = type;
      this.loadPopularReviews(type);
    }
  }

    loadPopularReviews(type: 'Song' | 'Album' | 'Artist') {
    this.reviewService.getTopReviewsByType(type).subscribe({
      next: (res) => {
        this.popularRecords =
          res.songs || res.albums || res.artists || [];
        setTimeout(() => {
          this.isDiscoverContentLoading = false;
        }, 250);
      },
      error: (err) => {
        this.toastr.error('Failed to load popular reviews:', err);
        this.popularRecords = [];
        this.isDiscoverContentLoading = false;
      }
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
      }
    });
  }

  toggleReviewExpansion(reviewId: string) {
    this.expandedReviews[reviewId] = !this.expandedReviews[reviewId];
  }

  openModal(record: Album | Artist | Song) {
    const modalOptions: NgbModalOptions = {
      backdrop: false,
      keyboard: true,
      centered: true,
      scrollable: true,
    };
  
    const modalRef = this.modal.open(ReviewPageComponent, modalOptions);

    if (record.type == 'Song') {
      const index = this.filteredResults.songs.findIndex(s => s === record);
      modalRef.componentInstance.songList = this.filteredResults.songs;
      modalRef.componentInstance.currentIndex = index;
    }

    modalRef.componentInstance.record = record;
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
    return !!this.results && (this.results.songs?.length > 0 || this.results.artists?.length > 0 || this.results.albums?.length > 0);
  }

  closeModal() {
    this.isModalOpen = false;
    this.selectedRecord = null;
  }

  goToUserProfile(userId: string) {
    this.router.navigate([`/profile/${userId}`]);
  }
}