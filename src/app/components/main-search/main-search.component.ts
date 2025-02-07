import { Component, ElementRef, ViewChild } from '@angular/core';
import { NgbModal, NgbModalOptions } from '@ng-bootstrap/ng-bootstrap';
import { SearchService } from 'src/app/services/search.service';
import { ReviewPageComponent } from '../review-page/review-page.component';

@Component({
  selector: 'app-main-search',
  templateUrl: './main-search.component.html',
  styleUrls: ['./main-search.component.css']
})
export class MainSearchComponent {
  @ViewChild('marqueeContainer') marqueeContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('marqueeTrack') marqueeTrack!: ElementRef<HTMLDivElement>;
  @ViewChild('searchBar') searchBar!: ElementRef<HTMLDivElement>;

  query: string = '';
  results: any = null;
  isLoading: boolean = false;
  errorMessage: string = '';
  activeTab: 'songs' | 'albums' | 'artists' = 'songs';
  private trackX = 0;
  private speed = 0.5; 
  isModalOpen = false;
  selectedRecord: any = null;

  constructor(private searchService: SearchService, public modal: NgbModal) {}

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
      const firstImgWidth = firstImg.offsetWidth + this.getMarginRight(firstImg);
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
      const elementTop = searchBarEl.getBoundingClientRect().top + window.pageYOffset;
      const offset = elementTop - 110;
       window.scrollTo({ top: offset, behavior: 'smooth' });
    }, 0);

    this.isLoading = true;
    this.errorMessage = '';

    this.searchService.searchMusic(this.query).subscribe({
      next: (data) => {
        this.results = data;
        this.setActiveTab('songs');
        this.isLoading = false;
      },
      error: (error) => {
        this.errorMessage = 'Failed to fetch results. Try again.';
        console.error('Search Error:', error);
        this.isLoading = false;
      }
    });
  }

  setActiveTab(tab: 'songs' | 'albums' | 'artists') {
    this.activeTab = tab;
  }

  openModal(record: any) {
    const modalOptions: NgbModalOptions = {
      backdrop: 'static', // Prevents closing on outside click
      keyboard: true, // Allows closing with ESC key
      centered: true, // Centers the modal
    };

    console.log("Opening modal with record:", record);
    const modalRef = this.modal.open(ReviewPageComponent, modalOptions);
    modalRef.componentInstance.record = record;
  }
  

  closeModal() {
    this.isModalOpen = false;
    this.selectedRecord = null;
  }
}