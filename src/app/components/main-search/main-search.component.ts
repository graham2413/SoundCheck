import { Component, ElementRef, ViewChild } from '@angular/core';
import { NgbModal, NgbModalOptions } from '@ng-bootstrap/ng-bootstrap';
import { SearchService } from 'src/app/services/search.service';
import { ReviewPageComponent } from '../review-page/review-page.component';
import { ToastrService } from 'ngx-toastr';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Song } from 'src/app/models/responses/song-response';
import { Album } from 'src/app/models/responses/album-response';
import { Artist } from 'src/app/models/responses/artist-response';

@Component({
  selector: 'app-main-search',
  templateUrl: './main-search.component.html',
  styleUrls: ['./main-search.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class MainSearchComponent {
  @ViewChild('marqueeContainer') marqueeContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('marqueeTrack') marqueeTrack!: ElementRef<HTMLDivElement>;
  @ViewChild('searchBar') searchBar!: ElementRef<HTMLDivElement>;

  query: string = '';
  isLoading: boolean = false;
  activeTab: 'songs' | 'albums' | 'artists' = 'songs';
  private trackX = 0;
  private speed = 0.5;
  isModalOpen = false;
  selectedRecord: any = null;
  searchAttempted = false;

  // Dropdown visibility state for genre filters
  showGenreDropdown = { songs: false, albums: false, artists: false };

  // Available genres for filtering
  genres = { songs: [] as string[], albums: [] as string[], artists: [] as string[] };

  // API results
  results: { songs: Song[]; albums: Album[]; artists: Artist[] } = { songs: [], albums: [], artists: [] };

  // Filtered results to store only matching genres
  filteredResults: { songs: Song[]; albums: Album[]; artists: Artist[] } = { songs: [], albums: [], artists: [] };

  constructor(private searchService: SearchService, private modal: NgbModal,
    private toastr: ToastrService
  ) { }

  ngAfterViewInit(): void {
    this.initializeMarquee();
    requestAnimationFrame(() => this.animateMarquee());
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

    // Scroll the search bar into view
    setTimeout(() => {
      const searchBarEl = this.searchBar.nativeElement;
      const elementTop =
        searchBarEl.getBoundingClientRect().top + window.pageYOffset;
      const offset = elementTop - 110;
      window.scrollTo({ top: offset, behavior: 'smooth' });
    }, 0);

    this.isLoading = true;
    this.searchAttempted = true;

    this.searchService.searchMusic(this.query).subscribe({
      next: (data) => {
        // Enhance images for better quality before storing results
        this.results = {
          ...data,
          songs: data.songs.map((song: { cover: string }) => ({
            ...song,
            cover: this.getHighQualityImage(song.cover)
          })),
          albums: data.albums.map((album: { cover: string }) => ({
            ...album,
            cover: this.getHighQualityImage(album.cover)
          })),
          artists: data.artists.map((artist: { picture: string }) => ({
            ...artist,
            picture: this.getHighQualityImage(artist.picture)
          }))
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
    this.genres.songs = [...new Set(this.results.songs.map(song => song.genre as string).filter(g => g))];
    this.genres.albums = [...new Set(this.results.albums.map(album => album.genre as string).filter(g => g))];
    this.genres.artists = [...new Set(this.results.artists.map(artist => artist.genre as string).filter(g => g))];
  }

  toggleGenreFilter(section: 'songs' | 'albums' | 'artists') {
    this.showGenreDropdown[section] = !this.showGenreDropdown[section];
  }

  filterByGenre(section: 'songs' | 'albums' | 'artists', genre: string) {
    if (section === 'songs') {
      this.filteredResults.songs = this.results.songs.filter(song => song.genre === genre);
    } else if (section === 'albums') {
      this.filteredResults.albums = this.results.albums.filter(album => album.genre === genre);
    } else if (section === 'artists') {
      this.filteredResults.artists = this.results.artists.filter(artist => artist.genre === genre);
    }
  
    this.showGenreDropdown[section] = false; // Hide dropdown after selecting
  }
  

  setActiveTab(tab: 'songs' | 'albums' | 'artists') {
    this.activeTab = tab;
  }

  openModal(record: any, type: string) {
    const modalOptions: NgbModalOptions = {
      backdrop: 'static',
      keyboard: true,
      centered: true,
      scrollable: true,
    };

    const modalRef = this.modal.open(ReviewPageComponent, modalOptions);
    modalRef.componentInstance.record = record;
    modalRef.componentInstance.type = type;
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
}