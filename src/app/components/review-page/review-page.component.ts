import { Component, input, Input } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

@Component({
  selector: 'app-review-page',
  templateUrl: './review-page.component.html',
  styleUrls: ['./review-page.component.css'],
})
export class ReviewPageComponent {
  @Input() record: any;
  @Input() type: string = '';

  isAddingReview = false;

  newReview: string = '';
  newRating: number = 5.0;

  constructor(public activeModal: NgbActiveModal) {}

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

  cancelReview() {
    this.newReview = '';
    this.newRating = 5.0;
    this.isAddingReview = false;
  }

  submitReview() {
    if (this.newReview.trim()) {
      // Insert logic to save the review, e.g. call an API or update your local record data.
      console.log('Review:', this.newReview);
      console.log('Rating:', this.newRating);

      // After submitting, reset the form and hide it
      this.newReview = '';
      this.newRating = 5.0;
      this.isAddingReview = false;
    } else {
      // Optionally handle empty review text case
      alert('Please write a review before submitting.');
    }
  }
}
