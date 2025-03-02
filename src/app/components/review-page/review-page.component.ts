import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
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

@Component({
  selector: 'app-review-page',
  templateUrl: './review-page.component.html',
  styleUrls: ['./review-page.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, AudioPlayerComponent],
  animations: [
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.9)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'scale(1)' }))
      ])
    ]),
    trigger('iPodTransition', [
      state('original', style({ transform: 'translateY(0%)', opacity: 1 })),
      state('shifted', style({ transform: 'translateY(100%)', opacity: 0 })),
      transition('original => shifted', animate('0.4s ease-in-out')),
      transition('shifted => original', animate('0.4s ease-in-out')),
    ]),
    trigger('fadeInContent', [
      state('hidden', style({ opacity: 0, transform: 'translateY(-10px)' })),
      state('visible', style({ opacity: 1, transform: 'translateY(0)' })),
      transition('hidden => visible', animate('0.4s ease-in-out')),
      transition('visible => hidden', animate('0.3s ease-in-out')),
    ]),
    trigger('mobileModalTransition', [
      state('original', style({ transform: 'translateX(0%)', opacity: 1 })),
      state('shifted', style({ transform: 'translateX(100%)', opacity: 0 })), // Move right when hidden
      transition('original => shifted', animate('0.4s ease-in-out')),
      transition('shifted => original', animate('0.4s ease-in-out')),
    ]),
    trigger('mobileFadeInContent', [
      state('hidden', style({ opacity: 0, transform: 'translateX(-100%)' })), // Enter from the left
      state('visible', style({ opacity: 1, transform: 'translateX(0)' })),  // Fade in to center
      transition('hidden => visible', animate('0.4s ease-in-out')),
      transition('visible => hidden', animate('0.3s ease-in-out')),
    ])
    
  ]
})
export class ReviewPageComponent implements OnInit {
  @Input() record: any;
  @Input() type: string = '';

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

  constructor(
    private activeModal: NgbActiveModal,
    private reviewService: ReviewService,
    private toastr: ToastrService,
    private searchService: SearchService
  ) {}

  ngOnInit(): void {
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
    }, 50);
  }

  getReviews() {
    this.reviewService.searchReviews(this.record.id, this.type).subscribe({
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

  public getExtraDetails(){
    if(this.type === 'song'){
      this.searchService.getTrackDetails(this.record.id).subscribe({
        next: (data: any) => {
          this.record.releaseDate = data.releaseDate;
          this.record.contributors = data.contributors;
          this.record.albumTitle = data.albumTitle;
          this.record.duration = data.duration;
        },
        error: (error) => {
          this.record.releaseDate = null;
        },
      });
    }

    if(this.type === 'album'){
      this.searchService.getAlbumDetails(this.record.id).subscribe({
        next: (data: any) => {
          this.record.releaseDate = data.releaseDate;
      
        },
        error: (error) => {
          this.record.releaseDate = null;
        },
      });
    }

  }

  formatDuration(seconds: number | undefined): string {
    if (!seconds) return "Unknown";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  }
  

  close() {
    this.activeModal.close();
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
    this.reviewService
      .createReview(this.record.id, this.type, this.newRating, this.newReview)
      .subscribe({
        next: (data: NewReviewResponse) => {
          this.existingUserReview = data.review;
          this.reviews = [...this.reviews, data.review];
          this.isAddingReview = false;
          this.isCreateLoading = false;
          this.toastr.success('Review created successfully.', 'Success');
        },
        error: (error) => {
          this.toastr.error('Error occurred while creating review.', 'Error');
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
      return 'linear-gradient(45deg, #9B5DE5, #F15BB5, #FEE440)'; // Special for 10/10
    } else {
      return '';
    }
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
