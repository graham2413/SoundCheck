import { Component, Input, OnInit } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import {
  Review,
  CreatedReviewResponse,
  Reviews,
} from 'src/app/models/responses/review-responses';
import { ReviewService } from 'src/app/services/review.service';

@Component({
  selector: 'app-review-page',
  templateUrl: './review-page.component.html',
  styleUrls: ['./review-page.component.css'],
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

  constructor(
    private activeModal: NgbActiveModal,
    private reviewService: ReviewService,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    this.getReviews();
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

  close() {
    this.activeModal.close();
  }

  toggleReviewForm() {
    this.isAddingReview = !this.isAddingReview;
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
        next: (data: CreatedReviewResponse) => {
          this.existingUserReview = data.review;
          this.reviews = [...this.reviews, data.review]
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
          next: (data: CreatedReviewResponse) => {
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

  deleteReview(review: Review) {}

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
}
