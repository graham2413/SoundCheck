import { CommonModule } from '@angular/common';
import { Component, ElementRef, input, Input, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import {
  Review,
  NewReviewResponse,
  Reviews,
} from 'src/app/models/responses/review-responses';
import { ReviewService } from 'src/app/services/review.service';
import { AudioPlayerComponent } from '../audio-player/audio-player.component';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { SearchService } from 'src/app/services/search.service';
import { Album } from 'src/app/models/responses/album-response';
import { Artist } from 'src/app/models/responses/artist-response';
import { Song } from 'src/app/models/responses/song-response';
import { CreateReviewCommandModel } from 'src/app/models/command-models/create-review-commandmodel';

@Component({
  selector: 'app-review-page',
  templateUrl: './review-page.component.html',
  styleUrls: ['./review-page.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, AudioPlayerComponent],
  animations: [
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(10px) scale(0.95)' }), 
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0) scale(1)' }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0, transform: 'translateY(10px) scale(0.95)' }))
      ])
    ]),     
    trigger('iPodTransition', [
      state('original', style({ transform: 'translateY(0%)', opacity: 1 })),
      state('shifted', style({ transform: 'translateY(100%)', opacity: 0 })),
      transition('original => shifted', animate('0.4s ease-in-out')),
      transition('shifted => original', animate('0.4s ease-in-out'))
    ]),
    trigger('fadeInContent', [
      state('hidden', style({ opacity: 0, transform: 'translateY(-10px)' })),
      state('visible', style({ opacity: 1, transform: 'translateY(0)' })),
      transition('hidden => visible', animate('0.4s ease-in-out')),
      transition('visible => hidden', animate('0.3s ease-in-out'))
    ]),
    trigger('slideUp', [
      transition(':enter', [
        style({ transform: 'translateY(100%)', opacity: 0 }),
        animate('300ms ease-out', style({ transform: 'translateY(0)', opacity: 1 }))
      ]),
      transition(':leave', [
        animate('300ms ease-in', style({ transform: 'translateY(100%)', opacity: 0 }))
      ])
    ]),
    trigger('slideAnimation', [
      transition('void => back', [ // Back screen enters from right
        style({ transform: 'translateX(100%)', opacity: 0 }),
        animate('400ms ease-out', style({ transform: 'translateX(0%)', opacity: 1 }))
      ]),
      transition('void => front', [ // Front screen enters from left
        style({ transform: 'translateX(-100%)', opacity: 0 }),
        animate('400ms ease-out', style({ transform: 'translateX(0%)', opacity: 1 }))
      ]),
      transition('back => front', [ // Going back to front, back slides right
        animate('400ms ease-in', style({ transform: 'translateX(100%)', opacity: 0 }))
      ]),
      transition('front => back', [ // Going to back, front slides left
        animate('400ms ease-in', style({ transform: 'translateX(-100%)', opacity: 0 }))
      ])
    ])
    
    
  ]
})
export class ReviewPageComponent implements OnInit {

  existingUserReview: Review | null = null;
  reviews: Review[] = [];
  isRatingLoaded = false;
  isReviewsLoaded = false;
  isImageLoaded = false;
  isAddingReview = false;
  isCreateLoading = false;
  newReview: string = '';
  newRating: number = 5.0;
  isEditLoading = false;
  isEditingReview = false;
  editedRating = 0;
  editedReviewText: string = '';
  isDeleteLoading = false;
  isPlaying = false;
  showSecondIpod = false;
  showSecondMobileIpod = false;
  isScrollable = false;
  isTextOverflowing = false;
  isModalOpen: boolean = true;

  @ViewChild('scrollContainer') scrollContainer!: ElementRef;
  @ViewChild('scrollingWrapper', { static: false }) scrollingWrapper!: ElementRef;
  @ViewChild('scrollingContent', { static: false }) scrollingContent!: ElementRef;
  @ViewChild('reviewsSection') reviewsSection!: ElementRef;

  @Input() record!: Album | Artist | Song;
  @Input() songList: Song[] = [];
  @Input() currentIndex: number = 0;
  @Input() showForwardAndBackwardButtons: boolean = true;

  constructor(
    private activeModal: NgbActiveModal,
    private reviewService: ReviewService,
    private toastr: ToastrService,
    private searchService: SearchService
  ) {}

  ngOnInit(): void {
    this.openRecord();
  }

  openRecord(){
    this.getReviews();
    this.getExtraDetails();
    setTimeout(() => {
      const modalElement = document.querySelector(
        '.modal-content'
      ) as HTMLElement;
      if (modalElement) {
        modalElement.scrollTop = 0; // Scroll to top
      }
    }, 100);
  }

  ngAfterViewInit() {
    setTimeout(() => {
      const modal = document.querySelector('.modal-dialog') as HTMLElement;
      if (modal) {
        modal.style.width = '90vw';
        modal.style.minWidth = '90vw';
      }
      this.checkOverflow();
  
      if (this.scrollContainer) {
        this.checkIfScrollable();
      }
    }, 200);
  }
  
  ngAfterViewChecked() {
    if (this.showSecondIpod && this.scrollContainer) {
      setTimeout(() => this.checkIfScrollable(), 0);
    }
  }  

  scrollToReviews(): void {
    if (this.reviewsSection) {
      this.reviewsSection.nativeElement.scrollIntoView({ behavior: 'smooth' });
    }
  }

  checkIfScrollable() {
    if (!this.scrollContainer) {
      return;
    }
  
    const el = this.scrollContainer.nativeElement;
    if (el) {
      this.isScrollable = el.scrollHeight > el.clientHeight;
    }
  }

  checkOverflow() {
    if (!this.scrollingWrapper || !this.scrollingContent) {
      setTimeout(() => this.checkOverflow(), 100);
      return;
    }
  
    const wrapper = this.scrollingWrapper.nativeElement;
    const content = this.scrollingContent.nativeElement;
  
    // Ensure width measurement is accurate by forcing reflow
    wrapper.offsetWidth; 
  
    this.isTextOverflowing = content.scrollWidth > wrapper.clientWidth;
  
    // Toggle 'scroll-active' class based on overflow
    if (this.isTextOverflowing) {
      this.scrollingWrapper.nativeElement.classList.add('scroll-active');
    } else {
      this.scrollingWrapper.nativeElement.classList.remove('scroll-active');
    }
  }  
  
  get flipState() {
    return this.showSecondIpod ? 'back' : 'front';
  }

  resetScrollingState() {
    this.isTextOverflowing = false;
    this.scrollingWrapper.nativeElement.classList.remove('scroll-active');
  
    // Temporarily hide title text to prevent flicker
    this.scrollingContent.nativeElement.style.visibility = 'hidden';
  
    setTimeout(() => {
      this.checkOverflow(); 
      this.scrollingContent.nativeElement.style.visibility = 'visible';
    }, 50);
  }

  formatDate(dateString: string | null | undefined): string {
    if (!dateString) return "Unknown"; // Handle empty or null values
  
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "Unknown"; // Handle invalid dates
  
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }
  

  getReviews() {
    this.reviewService.searchReviews(this.record.id, this.record.type).subscribe({
      next: (data: Reviews) => {
        this.reviews = data.reviews;
        this.existingUserReview = data.userReview;

        setTimeout(() => {
          this.isReviewsLoaded = true;
          this.isRatingLoaded = true;
          this.isImageLoaded = true;
        }, 100);
      },
      error: (error) => {
        this.toastr.error('Error occurred while retrieving reviews.', 'Error');
        this.isRatingLoaded = true;
        this.isReviewsLoaded = true;
        this.isImageLoaded = true;
      },
    });
  }

  get iPodState() {
    return this.showSecondIpod ? 'shifted' : 'original';
  }

  get contentState() {
    return this.showSecondIpod ? 'visible' : 'hidden';
  }

  get mobileModalState() {
    return this.showSecondMobileIpod ? 'shifted' : 'original';
  }

  get mobileContentState() {
    return this.showSecondMobileIpod ? 'visible' : 'hidden';
  }

  get isExplicit(): boolean {
    return this.record?.type === 'Song' && 'isExplicit' in this.record
      ? (this.record as Song).isExplicit
      : false;
  }
  

  public getExtraDetails() {
    if (this.record.type === 'Song') {
      this.searchService.getTrackDetails(this.record.id).subscribe({
        next: (data: Song) => {
          (this.record as Song).releaseDate = data.releaseDate;
          (this.record as Song).contributors = data.contributors;
          (this.record as Song).duration = data.duration;
        },
        error: () => {
          (this.record as Song).releaseDate = '';
        },
      });
    }
  
    if (this.record.type === 'Album') {
      this.searchService.getAlbumDetails(this.record.id).subscribe({
        next: (data: Album) => {
          const album = this.record as Album;
          album.releaseDate = data.releaseDate;
          album.tracklist = data.tracklist;
        },
        error: () => {
          const album = this.record as Album;
          album.releaseDate = 'Unknown';
          album.tracklist = [];
        },
      });
    }
    
    if (this.record.type === 'Artist') {
      this.searchService.getArtistTracks(this.record.id).subscribe({
        next: (data: Song[]) => {
      
          const artist = this.record as Artist;
          artist.tracklist = Array.isArray(data) ? data : [];
      
        },
        error: () => {
          const artist = this.record as Artist;
          artist.tracklist = [];
        },
      });
    }
  }
  
  nextSong() {
    if (this.currentIndex < this.songList.length - 1) {
      this.currentIndex++;
      this.record = this.songList[this.currentIndex];

      this.isReviewsLoaded = false;
      this.isRatingLoaded = false;
      this.isImageLoaded = false;

      this.resetScrollingState();
      this.openRecord();
    }
  }
  
  prevSong() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.record = this.songList[this.currentIndex];
      
      this.isReviewsLoaded = false;
      this.isRatingLoaded = false;
      this.isImageLoaded = false;

      this.resetScrollingState();
      this.openRecord();
    }
  }

  formatDuration(seconds: number | undefined): string {
    if (!seconds) return "Unknown";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  }

  close() {
    this.isModalOpen = false;
    setTimeout(() => {
      this.activeModal.close();
    }, 150);
  }
  
  toggleReviewForm() {
    this.isAddingReview = !this.isAddingReview;
    if(this.isAddingReview){
      this.newRating = 5;
      this.newReview = '';
    }
  }

  get filteredReviews() {
    if (!this.reviews) {
      return [];
    }
  
    return this.reviews.filter(review => {
      if (!this.existingUserReview || !this.existingUserReview.user) {
        return true;
      }
      return review.user._id !== this.existingUserReview.user._id;
    });
  }

  cancelReview() {
    this.newReview = '';
    this.newRating = 5.0;
    this.isAddingReview = false;
  }

  submitReview() {
    this.isCreateLoading = true;
  
    // Build the command model
    const reviewCommand: CreateReviewCommandModel = {
      albumSongOrArtist: {
        id: this.record.id,
        type: this.record.type,
        title: this.record.type !== "Artist" ? this.record.title : undefined, // Only for Albums & Songs
        name: this.record.type === "Artist" ? this.record.name : this.record.artist, // Artists use 'name', Albums/Songs use 'artist'
        cover: this.record.type !== "Artist" ? this.record.cover : undefined, // Only for Albums & Songs
        picture: this.record.type === "Artist" ? this.record.picture : undefined // Only for Artists
      },
      rating: this.newRating,
      reviewText: this.newReview
    };
  
    // Call the API with the command object
    this.reviewService.createReview(reviewCommand).subscribe({
      next: (data: NewReviewResponse) => {
        this.existingUserReview = data.review;
        this.reviews = [...this.reviews, data.review];
        this.isAddingReview = false;
        this.isCreateLoading = false;
        this.toastr.success("Review created successfully.", "Success");
      },
      error: (error) => {
        this.toastr.error("Error occurred while creating review.", "Error");
        this.isCreateLoading = false;
      },
    });
  }  

  toggleEditReview(review: Review) {
    this.isEditingReview = true;
    this.editedRating = review.rating;
    this.editedReviewText = review.reviewText;
  }

  cancelEditReview() {
    this.isEditingReview = false;
  }

  submitEditReview() {
    this.isEditLoading = true;
    if (this.existingUserReview && this.existingUserReview._id) {
      this.reviewService
        .editReview(
          this.existingUserReview?._id,
          this.editedRating,
          this.editedReviewText
        )
        .subscribe({
          next: (data: NewReviewResponse) => {
            this.existingUserReview = data.review;

            this.reviews = this.reviews.map((review) =>
              review._id === data.review._id ? data.review : review
            );            
            
            this.isEditingReview = false;
            this.isEditLoading = false;
            this.toastr.success('Review edited successfully.', 'Success');
          },
          error: (error) => {
            this.isEditLoading = false;
            this.toastr.error('Error occurred while editing review.', 'Error');
          },
        });
    }
  }

  deleteReview(review: Review) {
    this.isDeleteLoading = true;
    if (this.existingUserReview && this.existingUserReview._id) {
      this.reviewService
        .deleteReview(
          review._id
        )
        .subscribe({
          next: () => {
            this.reviews = this.reviews.filter(r => r._id !== review._id);
            this.existingUserReview = null;
            this.isDeleteLoading = false;
            this.toastr.success('Review deleted successfully.', 'Success');
          },
          error: (error) => {
            this.isDeleteLoading = false;
            this.toastr.error('Error occurred while deleting review.', 'Error');
          },
        });
      }
  }

  updatePlayStatus(status: boolean) {
    this.isPlaying = status;
  }

  getRatingGradient(rating: number): string {
    if (rating < 5) {
      return 'linear-gradient(to right, #FF6B6B, #E63946)'; // Red - Very Poor
    } else if (rating >= 5 && rating < 6) {
      return 'linear-gradient(to right, #FF9F1C, #FF7F11)'; // Orange - Below Average
    } else if (rating >= 6 && rating < 7) {
      return 'linear-gradient(to right, #FFD166, #FFC300)'; // Yellow - Average
    } else if (rating >= 7 && rating < 8) {
      return 'linear-gradient(to right, #06D6A0, #05A676)'; // Green - Good
    } else if (rating >= 8 && rating < 9) {
      return 'linear-gradient(to right, #118AB2, #0E7490)'; // Teal - Very Good
    } else if (rating >= 9 && rating < 10) {
      return 'linear-gradient(to right, #3A86FF, #1E40AF)'; // Blue - Excellent
    } else if (rating === 10) {
      return 'linear-gradient(45deg, #9B5DE5, #F15BB5, #FEE440)'; // Perfect
    } else {
      return '';
    }
  }

  get isTracklistArray(): boolean {
    return Array.isArray((this.record as Album | Artist).tracklist);
  }  

  getAverageRating(): number {
    if (!this.reviews || this.reviews.length === 0) {
      return 0;
    }
    const total = this.reviews.reduce((sum, review) => sum + review.rating, 0);
    return total / this.reviews.length;
  }

  trackById(index: number, item: Review) {
    return item._id;
  }

  
  onKeyPressRating(event: KeyboardEvent, type: 'new' | 'edit'): void {
    const input = event.target as HTMLInputElement;
    const newValue = input.value + event.key;
  
    // Prevent non-numeric characters except for backspace
    if (!/^\d*\.?\d*$/.test(event.key) && event.key !== 'Backspace') {
      event.preventDefault();
      return;
    }
  
    // Restrict input length to max 3 characters (e.g., "10", "9.5", "5.0")
    if (newValue.length > 3) {
      event.preventDefault();
    }
  }
  
  onBlurRating(type: 'new' | 'edit'): void {
    let rating = type === 'new' ? Number(this.newRating) : Number(this.editedRating);
  
    if (isNaN(rating) || rating === null) {
      rating = 5;
    } else if (rating < 0) {
      rating = 0;
    } else if (rating > 10) {
      rating = 10;
    }
  
    // Assign the corrected value back
    if (type === 'new') {
      this.newRating = rating;
    } else {
      this.editedRating = rating;
    }
  }
  
  
  
}
