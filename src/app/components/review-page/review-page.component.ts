import { Component, Input, OnInit } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { Review, CreatedReviewResponse, Reviews } from 'src/app/models/responses/review-responses';
import { ReviewService } from 'src/app/services/review.service';

@Component({
  selector: 'app-review-page',
  templateUrl: './review-page.component.html',
  styleUrls: ['./review-page.component.css'],
})
export class ReviewPageComponent implements OnInit{
  @Input() record: any;
  @Input() type: string = '';

  isAddingReview = false;

  newReview: string = '';
  newRating: number = 5.0;
  existingUserReview: Review | null = null;
  reviews: Review[] = [];

  constructor(private activeModal: NgbActiveModal, private reviewService: ReviewService) {}

  ngOnInit(): void {
    this.getReviews();
    setTimeout(() => {
      const modalElement = document.querySelector('.modal-content') as HTMLElement;
      if (modalElement) {
        modalElement.scrollTop = 0; // Scroll to top
      }
    }, 100);
  }

  getReviews() {
    this.reviewService.searchReviews(this.record.id, this.type).subscribe({
      next: (data: Reviews) => {
        this.reviews = data.reviews;
        this.existingUserReview = data.userReview;
        // this.isLoading = false;
      },
      error: (error) => {
        // this.errorMessage = 'Failed to fetch results. Try again.';
        // this.isLoading = false;
      },
    });
  }

  close() {
    this.activeModal.close();
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

  toggleReviewForm() {
    this.isAddingReview = !this.isAddingReview;
  }

  get filteredReviews() {
    return this.reviews?.filter(review => review.user._id !== this.existingUserReview?.user._id);
  }

  cancelReview() {
    this.newReview = '';
    this.newRating = 5.0;
    this.isAddingReview = false;
  }

  submitReview() {
      this.reviewService.createReview(this.record.id, this.type, this.newRating, this.newReview).subscribe({
        next: (data: CreatedReviewResponse) => {
          this.existingUserReview = data.review;
          this.reviews = this.reviews.filter(review => review.user._id !== this.existingUserReview?.user._id);
          this.isAddingReview = false;
        },
        error: (error) => {
          // this.errorMessage = 'Failed to create review. Try again.';
          // this.isLoading = false;
        },
      });
    }

    getAverageRating(): number {
      if (!this.filteredReviews || this.filteredReviews.length === 0) {
        return 0; // Default to 0 if there are no reviews
      }
      const total = this.filteredReviews.reduce((sum, review) => sum + review.rating, 0);
      return total / this.filteredReviews.length;
    }
    
  }
