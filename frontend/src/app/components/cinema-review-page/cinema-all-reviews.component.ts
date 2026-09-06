import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CinemaReview } from '../../models/responses/cinema-response';
import { ReviewFilter, ReviewSort } from './cinema-review-page.component';

// Full-screen "See All Reviews" list (opened from the Reviews tab's "See
// All N Reviews" link). Per the mockup: everything from the header down
// through the All/My Reviews/Sort row is sticky - only the review cards
// below it scroll. Reuses the same rating-ring UI as the main detail page's
// ratings row (NOT the star+number style shown in the raw reference image).
@Component({
  selector: 'app-cinema-all-reviews',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cinema-all-reviews.component.html',
  styleUrls: ['./cinema-all-reviews.component.css'],
})
export class CinemaAllReviewsComponent implements OnInit {
  @Input() title = '';
  @Input() cover: string | null = null;
  @Input() appRating: number | null = null;
  @Input() appReviewCount: number | null = null;

  @Input() reviews: CinemaReview[] = [];
  @Input() currentUserId: string | null = null;
  @Input() reviewFilter: ReviewFilter = 'all';
  @Input() reviewSort: ReviewSort = 'recent';

  @Output() back = new EventEmitter<void>();
  @Output() reviewFilterChange = new EventEmitter<ReviewFilter>();
  @Output() reviewSortChange = new EventEmitter<ReviewSort>();
  @Output() toggleReviewLike = new EventEmitter<CinemaReview>();

  private static readonly RING_RADIUS = 45;

  private avatarLoaded: { [key: string]: boolean } = {};

  markAvatarLoaded(key: string): void {
    this.avatarLoaded[key] = true;
  }

  isAvatarLoaded(key: string): boolean {
    return this.avatarLoaded[key] === true;
  }

  posterLoaded = false;

  markPosterLoaded(): void {
    this.posterLoaded = true;
  }

  // Same Cloudinary face-centered crop used for profile pictures everywhere
  // else in the app - see cinema-review-page.component.ts for the full note.
  profilePictureUrl(url: string | null | undefined): string {
    if (!url) return 'assets/user.png';
    return url.replace('/upload/', '/upload/w_400,h_400,c_fill,g_face,f_auto,q_auto/');
  }

  get filteredReviews(): CinemaReview[] {
    if (this.reviewFilter === 'mine') {
      return this.reviews.filter((r) => r.user._id === this.currentUserId);
    }
    return this.reviews;
  }

  isReviewLiked(review: CinemaReview): boolean {
    return !!this.currentUserId && !!review.likedBy?.includes(this.currentUserId);
  }

  // 5-star display converted from the 0-10 decimalRating, with PARTIAL fill
  // per star (matches cinema-review-page.component.ts's logic).
  starFillPercent(starIndex: number, decimalRating: number | undefined): number {
    const rating5 = (decimalRating ?? 0) / 2;
    return Math.max(0, Math.min(100, (rating5 - (starIndex - 1)) * 100));
  }

  onReviewFilterChange(filter: ReviewFilter): void {
    this.reviewFilter = filter;
    this.reviewFilterChange.emit(filter);
  }

  onReviewSortChange(sort: ReviewSort): void {
    this.reviewSort = sort;
    this.reviewSortChange.emit(sort);
  }

  get ringCircumference(): number {
    return 2 * Math.PI * CinemaAllReviewsComponent.RING_RADIUS;
  }

  // Ring starts at 0% and animates in on first render (matches the main
  // detail page's ring behavior - see cinema-review-page.component.ts).
  ringsReady = false;

  ngOnInit(): void {
    // Double rAF, not setTimeout(fn, 0) - see cinema-review-page.component.ts.
    requestAnimationFrame(() => requestAnimationFrame(() => (this.ringsReady = true)));
  }

  get appRingDashoffset(): number {
    if (!this.ringsReady) return this.ringCircumference;
    const fraction = Math.max(0, Math.min(1, (this.appRating ?? 0) / 10));
    return this.ringCircumference * (1 - fraction);
  }

  get formattedAppRating(): string | null {
    return this.appRating != null ? this.appRating.toFixed(1) : null;
  }
}
