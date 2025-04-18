import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  Input,
  OnInit,
  QueryList,
  ViewChild,
  ViewChildren,
} from '@angular/core';
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
import {
  animate,
  state,
  style,
  transition,
  trigger,
} from '@angular/animations';
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
    trigger('overlayAnimation', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(30px)' }),
        animate(
          '250ms ease-out',
          style({ opacity: 1, transform: 'translateY(0)' })
        ),
      ]),
      transition(':leave', [
        animate(
          '200ms ease-in',
          style({ opacity: 0, transform: 'translateY(30px)' })
        ),
      ]),
    ]),
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(10px) scale(0.95)' }),
        animate(
          '300ms ease-out',
          style({ opacity: 1, transform: 'translateY(0) scale(1)' })
        ),
      ]),
      transition(':leave', [
        animate(
          '200ms ease-in',
          style({ opacity: 0, transform: 'translateY(10px) scale(0.95)' })
        ),
      ]),
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
    trigger('slideUp', [
      transition(':enter', [
        style({ transform: 'translateY(100%)', opacity: 0 }),
        animate(
          '300ms ease-out',
          style({ transform: 'translateY(0)', opacity: 1 })
        ),
      ]),
      transition(':leave', [
        animate(
          '300ms ease-in',
          style({ transform: 'translateY(100%)', opacity: 0 })
        ),
      ]),
    ]),
    trigger('slideAnimation', [
      // Front enters
      transition('void => front', [
        style({ transform: 'translateX(-100%)', opacity: 0 }),
        animate(
          '400ms ease-out',
          style({ transform: 'translateX(0)', opacity: 1 })
        ),
      ]),

      // Back enters
      transition('void => back', [
        style({ transform: 'translateX(100%)', opacity: 0 }),
        animate(
          '400ms ease-out',
          style({ transform: 'translateX(0)', opacity: 1 })
        ),
      ]),

      // Front to Back
      transition('front => back', [
        animate(
          '400ms ease-in',
          style({ transform: 'translateX(-100%)', opacity: 0 })
        ),
      ]),

      // Back to Front
      transition('back => front', [
        animate(
          '400ms ease-in',
          style({ transform: 'translateX(100%)', opacity: 0 })
        ),
      ]),

      // Front to Hidden (used when hiding front)
      transition('front => hidden', [
        animate(
          '400ms ease-in',
          style({ transform: 'translateX(-100%)', opacity: 0 })
        ),
      ]),

      // Hidden to Front (used when showing front)
      transition('hidden => front', [
        style({ transform: 'translateX(-100%)', opacity: 0 }),
        animate(
          '400ms ease-out',
          style({ transform: 'translateX(0)', opacity: 1 })
        ),
      ]),

      // Back to Hidden
      transition('back => hidden', [
        animate(
          '400ms ease-in',
          style({ transform: 'translateX(100%)', opacity: 0 })
        ),
      ]),

      // Hidden to Back
      transition('hidden => back', [
        style({ transform: 'translateX(100%)', opacity: 0 }),
        animate(
          '400ms ease-out',
          style({ transform: 'translateX(0)', opacity: 1 })
        ),
      ]),
    ]),
  ],
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
  stars = Array(10).fill(0);
  ratingBarFill: number = 0;
  circleDashOffset: number = 113.1;
  isCompactView = false;
  page = 1;
  pageSize = 25;
  filterMenuOpen = false;
  activeFilter: string | null = null;
  showDeleteConfirmation = false;

  @ViewChild('scrollContainer') scrollContainer!: ElementRef;
  @ViewChild('scrollingWrapper', { static: false }) scrollingWrapper!: ElementRef;
  @ViewChild('scrollingContent', { static: false }) scrollingContent!: ElementRef;

  @ViewChild('scrollingWrapperDesktop', { static: false }) scrollingWrapperDesktop!: ElementRef;
  @ViewChild('scrollingContentDesktop', { static: false }) scrollingContentDesktop!: ElementRef;
  
  @ViewChild('reviewsSection') reviewsSection!: ElementRef;
  @ViewChild('reviewsSectionDesktop') reviewsSectionDesktop!: ElementRef;
  @ViewChild('iPodFront') iPodFront!: ElementRef;

  @Input() record!: Album | Artist | Song;
  @Input() songList: Song[] = [];
  @Input() currentIndex: number = 0;
  @Input() showForwardAndBackwardButtons: boolean = true;
  @ViewChildren(AudioPlayerComponent)
  audioPlayers!: QueryList<AudioPlayerComponent>;

  constructor(
    private activeModal: NgbActiveModal,
    private reviewService: ReviewService,
    private toastr: ToastrService,
    private searchService: SearchService
  ) {}

  ngOnInit(): void {
    this.openRecord();
    this.checkIfCompactView();
    window.addEventListener('resize', this.checkIfCompactView.bind(this));
  }

  checkIfCompactView() {
    this.isCompactView = window.innerHeight < 705;
  }

  ngAfterViewInit() {
    setTimeout(() => {
      requestAnimationFrame(() => {
        this.checkOverflow(); // initial render

        if (this.scrollContainer) {
          this.checkIfScrollable();
        }
      });
    }, 200);
  }

  ngOnChanges() {
    setTimeout(() => this.checkOverflow(), 0);
  }

  ngAfterViewChecked() {
    if (this.showSecondIpod && this.scrollContainer) {
      setTimeout(() => this.checkIfScrollable(), 0);
    }
  }

  openRecord() {
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

  scrollToReviews(): void {
    if (this.reviewsSection) {
      this.reviewsSection.nativeElement.scrollIntoView({ behavior: 'smooth' });
    }
  }

  scrollToTopOfIpod(): void {
    if (this.iPodFront) {
      this.iPodFront.nativeElement.scrollIntoView({ behavior: 'smooth' });
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
    const isDesktop = window.innerWidth >= 768; // Assuming 768px as the desktop breakpoint
  
    // Select the appropriate wrapper and content based on screen size
    const wrapper = isDesktop ? this.scrollingWrapperDesktop?.nativeElement : this.scrollingWrapper?.nativeElement;
    const content = isDesktop ? this.scrollingContentDesktop?.nativeElement : this.scrollingContent?.nativeElement;
  
    if (!wrapper || !content) return;
  
    const wrapperWidth = wrapper.offsetWidth;
    const contentWidth = content.scrollWidth;
  
    const buffer = 0.95;
    const isOverflowing = contentWidth > wrapperWidth * buffer;
    this.isTextOverflowing = isOverflowing;
  
    console.log('Overflow:', isOverflowing, 'Wrapper width:', wrapperWidth, 'Content width:', contentWidth);
  
    if (isOverflowing) {
      // Set --start-offset to wrapper's width so scroll starts just off-screen
      content.style.setProperty('--start-offset', `${wrapperWidth}px`);
    } else {
      content.style.removeProperty('--start-offset');
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

  floor(value: number): number {
    return Math.floor(value);
  }

  formatDate(dateString: string | null | undefined): string {
    if (!dateString) return 'Unknown'; // Handle empty or null values

    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Unknown'; // Handle invalid dates

    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  getReviews() {
    this.reviewService
      .searchReviews(this.record.id, this.record.type)
      .subscribe({
        next: (data: Reviews) => {
          this.reviews = data.reviews;
          // this.reviews = Array.from({ length: 35 }, (_, i) => ({
          //   _id: `review${i + 1}`,
          //   __v: 0,
          //   user: {
          //     _id: `user${i + 1}`,
          //     username: `User${i + 1} long de df fd df df df`,
          //     email: `user${i + 1}@example.com`,
          //     profilePicture: `https://i.pravatar.cc/150?img=${i + 1}`,
          //     friendInfo: {
          //       friends: [],
          //       pendingRequests: [],
          //       sentRequests: [],
          //       friendRequestsSent: [],
          //       friendRequestsReceived: [],
          //     },
          //     googleId: `google-${i + 1}`,
          //   },
          //   rating: Math.floor(Math.random() * 10) + 1,
          //   reviewText: `This is a dummy review number ${i + 1}. Slaps.`,
          //   createdAt: new Date(Date.now() - i * 86400000).toISOString(),
          //   albumOrSongId: 'dummy123',
          //   type: 'Song',
          //   title: 'Dummy Song',
          // }));

          this.existingUserReview = data.userReview;

          this.ratingBarFill = 0;
          this.circleDashOffset = 113.1;
          this.isRatingLoaded = true;
          this.isReviewsLoaded = true;
          this.isImageLoaded = true;

          setTimeout(() => {
            this.ratingBarFill = this.getAverageRating() * 10;
            this.circleDashOffset =
              113.1 - (this.getAverageRating() / 10) * 113.1;
          }, 50);
        },
        error: (error) => {
          this.toastr.error(
            'Error occurred while retrieving reviews.',
            'Error'
          );
          this.isRatingLoaded = true;
          this.isReviewsLoaded = true;
          this.isImageLoaded = true;
        },
      });
  }

  get combinedReviews(): Review[] {
    if (!this.isReviewsLoaded) return [];
  
    // Ensure the existing user review isn't duplicated in filteredReviews
    const filtered = this.filteredReviews.filter(
      (r) => !this.existingUserReview || r._id !== this.existingUserReview._id
    );
  
    return this.existingUserReview ? [this.existingUserReview, ...filtered] : filtered;
  }
  

  get totalPages(): number {
    return Math.ceil(this.combinedReviews.length / this.pageSize);
  }

  get pagedReviews() {
    const start = (this.page - 1) * this.pageSize;
    const end = start + this.pageSize;
    return this.combinedReviews.slice(start, end);
  }

  changePage(pageNumber: number) {
    this.page = pageNumber;
    this.scrollToTopOfReviews();
  }

  scrollToTopOfReviews() {
    setTimeout(() => {
      const mobileEl = this.reviewsSection?.nativeElement;
      const desktopEl = this.reviewsSectionDesktop?.nativeElement;

      // Check which one is visible in the DOM
      if (desktopEl && desktopEl.offsetParent !== null) {
        desktopEl.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (mobileEl && mobileEl.offsetParent !== null) {
        mobileEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 0);
  }

  toggleFilterMenu() {
    this.filterMenuOpen = !this.filterMenuOpen;
  }

  applyFilter(type: string) {
    this.activeFilter = type;
    this.filterMenuOpen = false;
    this.page = 1;
    this.scrollToTopOfReviews();
  }

  clearFilter() {
    this.activeFilter = null;
    this.filterMenuOpen = false;
    this.page = 1;
    this.scrollToTopOfReviews();
  }

  isFilterActive(): boolean {
    return !!this.activeFilter;
  }

  get filteredReviews(): Review[] {
    if (!this.activeFilter) return this.reviews;
  
    switch (this.activeFilter) {
      case 'newest':
        return [...this.reviews].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  
      case 'highest':
        return [...this.reviews].sort((a, b) => b.rating - a.rating);
  
      case 'lowest':
        return [...this.reviews].sort((a, b) => a.rating - b.rating);
  
      default:
        return this.reviews;
    }
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
          (this.record as Song).preview = data.preview;
          this.audioPlayers.forEach((player: AudioPlayerComponent) =>
            player.stopLoading()
          );
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
      this.scrollToTopOfIpod();
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
      this.scrollToTopOfIpod();
      this.openRecord();
    }
  }

  formatDuration(seconds: number | undefined): string {
    if (!seconds) return 'Unknown';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  close() {
    this.isModalOpen = false;
    setTimeout(() => {
      this.activeModal.close();
    }, 150);
  }

  toggleReviewForm() {
    this.isAddingReview = !this.isAddingReview;
    if (this.isAddingReview) {
      this.newRating = 5;
      this.newReview = '';
    }
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
        title: this.record.type !== 'Artist' ? this.record.title : undefined, // Only for Albums & Songs
        name:
          this.record.type === 'Artist' ? this.record.name : this.record.artist, // Artists use 'name', Albums/Songs use 'artist'
        cover: this.record.type !== 'Artist' ? this.record.cover : undefined, // Only for Albums & Songs
        picture:
          this.record.type === 'Artist' ? this.record.picture : undefined, // Only for Artists
        artist: this.record.type !== 'Artist' ? this.record.artist : undefined, //  Only for Albums & Songs
        isExplicit:
          this.record.type === 'Song' ? this.record.isExplicit : undefined, // Only for Songs
        album: this.record.type === 'Song' ? this.record.album : undefined, // Only for Songs
      },
      rating: this.newRating,
      reviewText: this.newReview,
    };

    // Call the API with the command object
    this.reviewService.createReview(reviewCommand).subscribe({
      next: (data: NewReviewResponse) => {
        this.existingUserReview = data.review;
        this.reviews = [...this.reviews, data.review];
        this.isAddingReview = false;
        this.isCreateLoading = false;
        this.ratingBarFill = this.getAverageRating() * 10;
        setTimeout(() => {
          this.circleDashOffset =
            113.1 - (this.getAverageRating() / 10) * 113.1;
        }, 50);
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
            this.ratingBarFill = this.getAverageRating() * 10;
            setTimeout(() => {
              this.circleDashOffset =
                113.1 - (this.getAverageRating() / 10) * 113.1;
            }, 50);
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
      this.reviewService.deleteReview(review._id).subscribe({
        next: () => {
          this.reviews = this.reviews.filter((r) => r._id !== review._id);
          this.existingUserReview = null;
          this.isDeleteLoading = false;
          this.showDeleteConfirmation = false;
          this.ratingBarFill = this.getAverageRating() * 10;
          setTimeout(() => {
            this.circleDashOffset =
              113.1 - (this.getAverageRating() / 10) * 113.1;
          }, 50);
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

  getRatingBackground(rating: number): string {
    if (rating == 10.0) return 'rgb(1, 6, 0)';
    if (rating >= 9.0) return 'rgb(14, 72, 3)';
    if (rating >= 8.0) return 'rgb(3, 156, 31)';
    if (rating >= 7.0) return 'rgb(202, 201, 0)';
    if (rating >= 6.0) return 'rgb(223,106,8)';
    return 'rgb(215,8,7)';
  }

  getRatingGradient(): string {
    return 'linear-gradient(to right, #fde047, #facc15, #f59e0b, #b45309)';
  }

  getSliderBackground(value: number): string {
    const rawPercent = (value / 10) * 100;

    // Small dynamic correction curve based on empirical testing
    const correction =
      value < 1
        ? 0.8
        : value < 2
        ? 0.5
        : value < 3
        ? 0.3
        : value > 9
        ? -0.3
        : value > 8
        ? -0.5
        : value > 7
        ? -0.7
        : 0;

    const adjustedPercent = Math.min(Math.max(rawPercent + correction, 0), 100);

    return `linear-gradient(to right, #5D41D4 0%, #5D41D4 ${adjustedPercent}%, #858585 ${adjustedPercent}%, #858585 100%)`;
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
    let rating =
      type === 'new' ? Number(this.newRating) : Number(this.editedRating);

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

  getStarType(star: number, rating: number): 'full' | 'half' | 'empty' {
    if (rating >= star) return 'full';
    if (rating >= star - 0.5) return 'half';
    return 'empty';
  }
}
