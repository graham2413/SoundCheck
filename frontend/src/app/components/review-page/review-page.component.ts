import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  NgbActiveModal,
  NgbModal,
  NgbModalOptions,
} from '@ng-bootstrap/ng-bootstrap';
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
import { CinemaItem, CinemaReview } from 'src/app/models/responses/cinema-response';
import { CinemaService } from 'src/app/services/cinema.service';
import { CreateReviewCommandModel } from 'src/app/models/command-models/create-review-commandmodel';
import { ConfirmationModalComponent } from '../friends-page/confirmation-modal/confirmation-modal.component';
import { UserService } from 'src/app/services/user.service';
import { FollowedArtist, User } from 'src/app/models/responses/user.response';
import { Router } from '@angular/router';
import { forkJoin, Subscription } from 'rxjs';

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
export class ReviewPageComponent implements OnInit, OnDestroy {
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
  previousEditedRating = 0;
  editRatingDirection: 'up' | 'down' | null = null;
  private editRatingDirectionTimeout: any;
  tenCelebrationParticles: { cx: number; cy: number; px: number; py: number; key: number; color: string }[] = [];
  private tenCelebrationTimeout: any;
  private tenCelebrationClearTimeout: any;
  private hasPlayedLoadTenCelebration = false;
  private tenCelebrationParticleId = 0;
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
  addingToList: boolean = false;
  userProfile: User = {
    _id: '',
    username: '',
    gradient: '',
    createdAt: '',
    reviews: [],
    googleId: '',
    email: '',
    friends: [],
    profilePicture: '',
    artistList: [],
    friendInfo: {
      friends: [],
      friendRequestsReceived: [],
      friendRequestsSent: [],
    },
  } as User;
  isProfileLoading: boolean = false;
  isInList: boolean = false;
  currentSong: Song | null = null;
  isMobileView: boolean = false;

  @ViewChild('scrollContainer') scrollContainer!: ElementRef;
  @ViewChild('scrollingWrapper', { static: false })
  scrollingWrapper!: ElementRef;
  @ViewChild('scrollingContent', { static: false })
  scrollingContent!: ElementRef;

  @ViewChild('scrollingWrapperDesktop', { static: false })
  scrollingWrapperDesktop!: ElementRef;
  @ViewChild('scrollingContentDesktop', { static: false })
  scrollingContentDesktop!: ElementRef;

  @ViewChild('reviewsSection') reviewsSection!: ElementRef;
  @ViewChild('reviewsSectionDesktop') reviewsSectionDesktop!: ElementRef;
  @ViewChild('iPodFront') iPodFront!: ElementRef;

  @ViewChild('audioPlayerMobile') audioPlayerMobile!: AudioPlayerComponent;
  @ViewChild('audioPlayerDesktop') audioPlayerDesktop!: AudioPlayerComponent;

  @ViewChild('modalScrollContainer')
  modalScrollContainer!: ElementRef<HTMLDivElement>;

  @ViewChild('desktopImageArea')
  desktopImageArea!: ElementRef<HTMLDivElement>;

  // Card width tracks whichever is smaller: 400px, or the actual available
  // vertical space, so the square artwork never overflows nor leaves a gap.
  desktopCardWidth = 400;
  private desktopImageAreaResizeObserver?: ResizeObserver;

  @Input() record!: Album | Artist | Song | CinemaItem;
  @Input() recordList: (Album | Artist | Song | CinemaItem)[] = [];
  @Input() currentIndex: number = 0;
  @Input() showForwardAndBackwardButtons: boolean = true;
  @Input() activeDiscoverTab!: string;

  @Output() reviewEdited = new EventEmitter<Review>();
  @Output() reviewCreated = new EventEmitter<Review>();
  @Output() reviewDeleted = new EventEmitter<Review>();
  @Output() userNavigated = new EventEmitter<void>();
  @Output() openNewReview = new EventEmitter<{ id: number; type: string }>();
  isLoadingExtraDetails: boolean = false;
  activeTab: 'Top Tracks' | 'All Releases' = 'Top Tracks';
  releases: Album[] = [];
  pageIndex = 0;
  public isSingleAlbum: boolean = false;
  smartLinkUrl: string | null = null;
  isLoadingSmartUrl: boolean = true;
  showAppPickerModal: boolean = false;
  preferredApp: string | null = null;
  availablePlatforms: string[] = [
    'spotify',
    'appleMusic',
    'youtubeMusic',
    'deezer',
    'amazonMusic',
    'soundcloud',
    'pandora',
    'audiomack',
  ];

  platformStyles: Record<
    string,
    { label: string; color: string; icon?: string; imagePath?: string }
  > = {
    spotify: { label: 'Spotify', color: '#1DB954', icon: 'fab fa-spotify' },
    appleMusic: {
      label: 'Apple Music',
      color: '#FC3C44',
      icon: 'fab fa-apple',
    },
    youtubeMusic: {
      label: 'YouTube Music',
      color: '#FF0000',
      icon: 'fab fa-youtube',
    },
    amazonMusic: {
      label: 'Amazon Music',
      color: '#3B4CCA',
      icon: 'fab fa-amazon',
    },
    soundcloud: {
      label: 'SoundCloud',
      color: '#FF5500',
      icon: 'fab fa-soundcloud',
    },
    deezer: {
      label: 'Deezer',
      color: '#9333E8',
      imagePath: '../assets/deezer-logo.png',
    },
    audiomack: {
      label: 'Audiomack',
      color: '#FFBD00',
      imagePath: '../assets/audiomack-logo.png',
    },
    pandora: {
      label: 'Pandora',
      color: '#3668FF',
      imagePath: '../assets/pandora-logo.png',
    },
  };
  likedByCurrentUser?: boolean;
  animateHeart: { [reviewId: string]: boolean } = {};

  public smartLinkData: any = null;
  private trackDetailsSub?: Subscription;
  private smartLinkSub?: Subscription;
  private albumDetailsSub?: Subscription;
  trackImageLoaded: { [key: number]: boolean } = {};
  releaseImageLoaded: { [key: number]: boolean } = {};

  constructor(
    private activeModal: NgbActiveModal,
    private reviewService: ReviewService,
    private toastr: ToastrService,
    private searchService: SearchService,
    private modal: NgbModal,
    private userService: UserService,
    private router: Router,
    private ngZone: NgZone,
    private cinemaService: CinemaService
  ) {}

  ngOnInit(): void {
    this.isMobileView = window.innerWidth <= 768;
    this.isProfileLoading = true;
    this.openRecord();
    this.checkList();
    this.checkIfCompactView();
    window.addEventListener('resize', this.checkIfCompactView.bind(this));
  }

  checkIfCompactView() {
    this.isCompactView = window.innerHeight < 705;
  }

  checkList() {
    this.userService.userProfile$.subscribe((profile) => {
      if (profile) {
        this.userProfile = profile;
        this.isProfileLoading = false;
        this.updateIsInList();
      }
    });

    if (!this.userProfile || !this.userProfile.username) {
      this.userService.getAuthenticatedUserProfile().subscribe({
        next: () => {
          this.isProfileLoading = false;
          this.updateIsInList();
        },
        error: () => {
          this.isProfileLoading = false;
        },
      });
    }
  }

  updateIsInList() {
    this.isInList = this.isCinemaRecord
      ? false
      : this.userProfile.artistList?.some(
          (item) => item.id === this.musicRecord.id.toString()
        ) ?? false;
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

    this.setupDesktopImageAreaObserver();
  }

  ngOnDestroy(): void {
    this.desktopImageAreaResizeObserver?.disconnect();
  }

  private setupDesktopImageAreaObserver(): void {
    if (!this.desktopImageArea || typeof ResizeObserver === 'undefined') {
      return;
    }

    this.ngZone.runOutsideAngular(() => {
      this.desktopImageAreaResizeObserver = new ResizeObserver((entries) => {
        const availableHeight = entries[0]?.contentRect.height ?? 0;
        if (!availableHeight) return;

        // Card uses md:p-4 (16px) padding; keep the image square so its
        // gap to the card's top matches its gap to the sides.
        const cardPaddingPx = 16;
        const maxSquareSize = 400 - cardPaddingPx * 2;
        const squareSize = Math.min(maxSquareSize, availableHeight);
        const nextWidth = Math.round(squareSize + cardPaddingPx * 2);

        if (Math.abs(nextWidth - this.desktopCardWidth) > 1) {
          this.ngZone.run(() => {
            this.desktopCardWidth = nextWidth;
          });
        }
      });

      this.desktopImageAreaResizeObserver.observe(
        this.desktopImageArea.nativeElement
      );
    });
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
    this.getExtraDetails().then(() => {
      this.getReviews();

      setTimeout(() => {
        const modalElement = document.querySelector(
          '.modal-content'
        ) as HTMLElement;
        if (modalElement) {
          modalElement.scrollTop = 0;
        }
      }, 100);
    });
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
    const wrapper = isDesktop
      ? this.scrollingWrapperDesktop?.nativeElement
      : this.scrollingWrapper?.nativeElement;
    const content = isDesktop
      ? this.scrollingContentDesktop?.nativeElement
      : this.scrollingContent?.nativeElement;

    if (!wrapper || !content) return;

    const wrapperWidth = wrapper.offsetWidth;
    const contentWidth = content.scrollWidth;

    const buffer = 0.95;
    const isOverflowing = contentWidth > wrapperWidth * buffer;
    this.isTextOverflowing = isOverflowing;

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
    if (this.isCinemaRecord) {
      this.getCinemaReviews();
      return;
    }

    const inferredType =
      this.record.type === 'Album' && this.record.tracklist?.length === 1
        ? 'Song'
        : this.record.type;

    let title = '';
    let artist = '';

    if ('title' in this.record) {
      title = this.record.title;
    }

    if ('artist' in this.record) {
      artist = this.record.artist;
    }

    if ('name' in this.record && !title) {
      title = this.record.name;
    }

    this.reviewService
      .searchReviews(this.musicRecord.id, inferredType, title, artist)
      .subscribe({
        next: (data: Reviews) => {
          this.reviews = data.reviews;
          if (this.userProfile?._id) {
            this.reviews.forEach((review) => {
              review.likedByCurrentUser = review.likedBy
                .map((id) => id.toString())
                .includes(this.userProfile._id.toString());
            });
          }
          // this.reviews = Array.from({ length: 35 }, (_, i) => ({
          //   _id: `review${i + 1}`,
          //   __v: 0,
          //   user: {
          //     _id: `user${i + 1}`,
          //     username: `User${i + 1}`,
          //     email: `user${i + 1}@example.com`,
          //     profilePicture: `https://i.pravatar.cc/150?img=${(i % 70) + 1}`,
          //     friendInfo: {
          //       friends: [],
          //       pendingRequests: [],
          //       sentRequests: [],
          //       friendRequestsSent: [],
          //       friendRequestsReceived: [],
          //     },
          //     googleId: `google-${i + 1}`,
          //     reviews: [],
          //     friends: [],
          //     createdAt: new Date().toISOString(),
          //     artistList: [],
          //     gradient: 'linear-gradient(to right, #ff7e5f, #feb47b)',
          //   },
          //   rating: Math.floor(Math.random() * 10) + 1,
          //   reviewText: `This is a mock review #${i + 1}.`,
          //   createdAt: new Date(Date.now() - i * 86400000).toISOString(),
          //   albumOrSongId: `song-${i + 1}`,
          //   type: 'Song',
          //   title: `Mock Song Title ${i + 1}`,
          //   albumSongOrArtist: {
          //     id: (i + 1).toString(),
          //     title: `Mock Song Title ${i + 1}`,
          //     artist: `Artist ${i + 1}`,
          //     album: `Album ${i + 1}`,
          //     cover: `https://via.placeholder.com/150?text=Cover+${i + 1}`,
          //     preview: '',
          //     isExplicit: i % 3 === 0,
          //     genre: 'Pop',
          //     releaseDate: new Date(2023, 0, 1 + i).toISOString(),
          //     contributors: [`Contributor ${i + 1}`],
          //     duration: 200 + i,
          //     type: 'Song',
          //     isPlaying: false,
          //   },
          //   likes: Math.floor(Math.random() * 100), // Add mock likes
          //   likedBy: [], // Add mock likedBy array
          // }));

          this.existingUserReview = data.userReview;

          if (this.userProfile?._id && this.existingUserReview) {
            this.existingUserReview.likedByCurrentUser =
              this.existingUserReview.likedBy
                .map((id) => id.toString())
                .includes(this.userProfile._id.toString());
          }

          this.ratingBarFill = 0;
          this.circleDashOffset = 113.1;
          this.isRatingLoaded = true;
          this.isReviewsLoaded = true;
          this.isImageLoaded = true;

          setTimeout(() => {
            this.ratingBarFill = this.getAverageRating() * 10;
            this.circleDashOffset =
              113.1 - (this.getAverageRating() / 10) * 113.1;
            this.checkForLoadTenCelebration();
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

  getCinemaReviews() {
    this.cinemaService.getCinemaReviews(this.record as CinemaItem).subscribe({
      next: ({ data }) => {
        this.reviews = data.reviews.map((r) => this.mapCinemaReviewToReview(r));
        this.existingUserReview = data.userReview
          ? this.mapCinemaReviewToReview(data.userReview)
          : null;

        this.ratingBarFill = 0;
        this.circleDashOffset = 113.1;
        this.isRatingLoaded = true;
        this.isReviewsLoaded = true;
        this.isImageLoaded = true;

        setTimeout(() => {
          this.ratingBarFill = this.getAverageRating() * 10;
          this.circleDashOffset =
            113.1 - (this.getAverageRating() / 10) * 113.1;
          this.checkForLoadTenCelebration();
        }, 50);
      },
      error: () => {
        this.toastr.error(
          'Error occurred while retrieving reviews.',
          'Error'
        );
        this.reviews = [];
        this.existingUserReview = null;
        this.isRatingLoaded = true;
        this.isReviewsLoaded = true;
        this.isImageLoaded = true;
      },
    });
  }

  // Cinema reviews are CinemaItem documents, not the music Review shape -
  // normalize into a Review-compatible object so the shared reviews-list
  // template/edit/delete/like logic works unmodified for both record types.
  private mapCinemaReviewToReview(cr: CinemaReview): Review {
    const likedBy = cr.likedBy ?? [];
    return {
      _id: cr._id,
      user: cr.user,
      albumSongOrArtist: { id: cr._id, type: 'Album' } as any,
      rating: cr.decimalRating ?? 0,
      reviewText: cr.reviewText ?? '',
      createdAt: cr.createdAt,
      likes: cr.likes ?? 0,
      likedBy,
      likedByCurrentUser: this.userProfile?._id
        ? likedBy.map((id) => id.toString()).includes(this.userProfile._id.toString())
        : false,
    };
  }

  // Same normalization, but for the current user's own CinemaItem (returned
  // directly from cinemaService.editCinemaItem, which has no populated user).
  private mapCinemaItemToOwnReview(item: CinemaItem): Review {
    return {
      _id: item._id,
      user: {
        _id: this.userProfile?._id ?? '',
        username: this.userProfile?.username ?? 'You',
        profilePicture: this.userProfile?.profilePicture ?? '',
      },
      albumSongOrArtist: { id: item._id, type: 'Album' } as any,
      rating: item.decimalRating ?? 0,
      reviewText: item.reviewText ?? '',
      createdAt: item.createdAt,
      likes: item.likes ?? 0,
      likedBy: item.likedBy ?? [],
      likedByCurrentUser: false,
    };
  }

  get combinedReviews(): Review[] {
    if (!this.isReviewsLoaded) return [];

    // Ensure the existing user review isn't duplicated in filteredReviews
    const filtered = this.filteredReviews.filter(
      (r) => !this.existingUserReview || r._id !== this.existingUserReview._id
    );

    return this.existingUserReview
      ? [this.existingUserReview, ...filtered]
      : filtered;
  }

  get totalPages(): number {
    return Math.ceil(this.combinedReviews.length / this.pageSize);
  }

  get pagedReviews() {
    const start = (this.page - 1) * this.pageSize;
    const end = start + this.pageSize;
    return this.combinedReviews.slice(start, end);
  }

  get reviewsHeaderCount(): number {
    return this.combinedReviews.length;
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
        return [...this.reviews].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

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
    return (this.record?.type === 'Song' || this.record?.type === 'Album') &&
      'isExplicit' in this.record
      ? (this.record as Song | Album).isExplicit
      : false;
  }

  // Cinema records don't have a `type` field (music does) - they have `mediaType` instead.
  get isCinemaRecord(): boolean {
    return this.record?.type === 'Cinema';
  }

  get cinemaRecord(): CinemaItem | null {
    return this.isCinemaRecord ? (this.record as CinemaItem) : null;
  }

  get cinemaTypeLabel(): string {
    return this.cinemaRecord?.mediaType === 'tv' ? 'TV Show' : 'Movie';
  }

  // False for an untracked cinema search result (no real CinemaItem _id yet) -
  // there's no document to attach a rating to until it's imported/tracked.
  get canAddReview(): boolean {
    return this.isCinemaRecord ? !!this.cinemaRecord?._id : true;
  }

  // Safe cast for the audio-player, which is only ever rendered (via *ngIf)
  // when the record is confirmed to be a music record, not cinema.
  get musicRecord(): Album | Artist | Song {
    return this.record as Album | Artist | Song;
  }

  get musicRecordList(): (Album | Artist | Song)[] {
    return this.recordList.filter(
      (r): r is Album | Artist | Song => r.type !== 'Cinema'
    );
  }

  openMusicAppClick(event: MouseEvent): void {
    const preferredApp = localStorage.getItem('preferredMusicApp');

    if (!preferredApp) {
      event.preventDefault(); // Prevent default anchor nav
      this.showAppPickerModal = true;
    }

    // If preferredApp exists, do nothing: anchor href will open as expected
  }

  setPreferredMusicApp(app: string): void {
    this.preferredApp = app;
    localStorage.setItem('preferredMusicApp', app);
    this.showAppPickerModal = false;

    const links = this.smartLinkData?.linksByPlatform || {};
    const preferredUrl = links[app]?.url || this.smartLinkData?.pageUrl || null;

    if (preferredUrl) {
      this.smartLinkUrl = preferredUrl;
      window.open(preferredUrl, '_blank', 'noopener');
      return;
    }

    // Fallback: refetch smart link only if we don't already have it
    const id = this.musicRecord.id;
    const deezerUrl =
      this.record.type === 'Album'
        ? `https://www.deezer.com/album/${id}`
        : `https://www.deezer.com/track/${id}`;

    // Cancel any ongoing smartLink request before retrying
    this.smartLinkSub?.unsubscribe();

    this.smartLinkSub = this.searchService.getSmartLink(deezerUrl).subscribe({
      next: (res) => {
        // Make sure we’re still looking at the same record
        if (this.musicRecord.id !== id) return;

        this.smartLinkData = res;
        const fallbackUrl =
          res.linksByPlatform?.[app]?.url || res.pageUrl || null;
        this.smartLinkUrl = fallbackUrl;

        if (fallbackUrl) {
          window.open(fallbackUrl, '_blank', 'noopener');
        } else {
          this.toastr.error('No link available for this app.', 'Error');
        }
      },
      error: () => {
        if (this.musicRecord.id !== id) return;
        console.error(
          'Failed to fetch smart link after setting preferred app.'
        );
        this.toastr.error('Failed to open music app link.', 'Error');
      },
    });
  }

  shadeColor(color: string, percent: number) {
    let R = parseInt(color.substring(1, 3), 16);
    let G = parseInt(color.substring(3, 5), 16);
    let B = parseInt(color.substring(5, 7), 16);

    R = Math.round((R * (100 + percent)) / 100);
    G = Math.round((G * (100 + percent)) / 100);
    B = Math.round((B * (100 + percent)) / 100);

    R = R < 255 ? R : 255;
    G = G < 255 ? G : 255;
    B = B < 255 ? B : 255;

    const RR = R.toString(16).padStart(2, '0');
    const GG = G.toString(16).padStart(2, '0');
    const BB = B.toString(16).padStart(2, '0');

    return `#${RR}${GG}${BB}`;
  }

  public getExtraDetails(): Promise<void> {
    this.isLoadingExtraDetails = true;

    // Cinema records already carry all the detail data they need (title,
    // cover, genres, rating) - no extra music-API fetch to do here.
    if (this.isCinemaRecord) {
      this.isLoadingExtraDetails = false;
      return Promise.resolve();
    }

    const isActuallyAnAlbum =
      this.record.type === 'Song' &&
      (this.record as any)?.wasOriginallyAlbumButTreatedAsSingle;

    return new Promise<void>((resolve) => {
      if (this.record.type === 'Song' && isActuallyAnAlbum) {
        (this.record as any).type = 'Album';
        this.fetchAlbumDetails(resolve);
      } else if (this.record.type === 'Song') {
        this.fetchSongDetails(resolve);
      } else if (this.record.type === 'Album') {
        this.fetchAlbumDetails(resolve);
      } else {
        this.fetchArtistDetails(resolve);
      }
    });
  }

  fetchSongDetails(done?: () => void) {
    this.isLoadingSmartUrl = true;

    // Cancel any in-progress requests
    this.trackDetailsSub?.unsubscribe();
    this.smartLinkSub?.unsubscribe();

    this.trackDetailsSub = this.searchService
      .getTrackDetails(this.musicRecord.id)
      .subscribe({
        next: (data: Song) => {
          const song = this.record as Song;

          song.releaseDate = data.releaseDate;
          song.contributors = data.contributors;
          song.duration = data.duration;
          song.preview = data.preview;
          song.genre = data.genre;

          // Fetch smart link for this song
          // const deezerTrackUrl = `https://www.deezer.com/track/${song.id}`;
          // this.smartLinkSub = this.searchService
          //   .getSmartLink(deezerTrackUrl)
          //   .subscribe({
          //     next: (res) => {
          //       this.smartLinkData = res;

          //       const preferredApp = localStorage.getItem('preferredMusicApp');
          //       const links = res.linksByPlatform || {};

          //       this.smartLinkUrl =
          //         preferredApp && links[preferredApp]?.url
          //           ? links[preferredApp].url
          //           : res.pageUrl || null;
          //     },
          //     error: (err) => {
          //       console.error('Failed to fetch smart link for song:', err);
          //       this.smartLinkUrl = null;
          //       this.isLoadingSmartUrl = false;
          //     },
          //     complete: () => {
          //       this.isLoadingSmartUrl = false;
          //     },
          //   });

          const players = [this.audioPlayerMobile, this.audioPlayerDesktop];
          players.forEach((player) => player?.stopLoading());

          this.isLoadingExtraDetails = false;
          if (done) done();
        },
        error: () => {
          const song = this.record as Song;
          song.releaseDate = '';
          this.isLoadingExtraDetails = false;
          this.isLoadingSmartUrl = false;
          if (done) done();
        },
      });
  }

  fetchAlbumDetails(done?: () => void) {
    this.isLoadingSmartUrl = true;

    // Cancel any previous requests
    this.albumDetailsSub?.unsubscribe();
    this.smartLinkSub?.unsubscribe();

    this.albumDetailsSub = this.searchService
      .getAlbumDetails(this.musicRecord.id)
      .subscribe({
        next: (data: Album) => {
          const album = this.record as Album;

          album.tracklist = data.tracklist.map((track) => ({
            ...track,
            isPlaying: false,
            cover: album.cover,
          }));

          this.isSingleAlbum =
            album.type === 'Album' &&
            Array.isArray(album.tracklist) &&
            album.tracklist.length === 1;

          if (album.tracklist.length > 0) {
            this.currentSong = album.tracklist[0];
          }

          album.preview = data.preview;
          album.artist = data.artist;
          album.genre = data.genre || 'Unknown';
          album.isExplicit = data.isExplicit;
          album.releaseDate = data.releaseDate || 'Unknown';
          album.contributors = data.contributors || [];

          // Fetch smart link
          const deezerUrl = `https://www.deezer.com/album/${album.id}`;
          this.smartLinkSub = this.searchService
            .getSmartLink(deezerUrl)
            .subscribe({
              next: (res) => {
                this.smartLinkData = res;

                const preferredApp = localStorage.getItem('preferredMusicApp');
                const links = res.linksByPlatform || {};

                this.smartLinkUrl =
                  preferredApp && links[preferredApp]?.url
                    ? links[preferredApp].url
                    : res.pageUrl || null;
              },
              error: (err) => {
                console.error('Failed to fetch smart link for album:', err);
                this.smartLinkUrl = null;
                this.isLoadingSmartUrl = false;
              },
              complete: () => {
                this.isLoadingSmartUrl = false;
              },
            });

          this.isLoadingExtraDetails = false;
        },
        error: () => {
          const album = this.record as Album;
          album.releaseDate = 'Unknown';
          album.tracklist = [];
          this.isLoadingExtraDetails = false;
          this.isLoadingSmartUrl = false;
        },
        complete: () => {
          const players = [this.audioPlayerMobile, this.audioPlayerDesktop];
          players.forEach((player) => player?.stopLoading());

          if (done) done();
        },
      });
  }

  fetchArtistDetails(done?: () => void) {
    if ((this.record as Artist).name === undefined) {
      console.warn('record is not an Artist');
      if (done) done();
      return;
    }

    this.trackImageLoaded = {};
    this.releaseImageLoaded = {};

    forkJoin({
      tracks: this.searchService.getArtistTracks(this.musicRecord.id),
      releases: this.searchService.getArtistReleases(
        this.musicRecord.id,
        (this.record as Artist).name
      ),
    }).subscribe({
      next: ({ tracks, releases }) => {
        const artist = this.record as Artist;

        // Set tracklist with high-res covers
        artist.tracklist = Array.isArray(tracks)
          ? tracks.map((track) => ({
              ...track,
              isPlaying: false,
              cover: this.getHighQualityImage(track.cover),
            }))
          : [];

        artist.preview = tracks[0]?.preview || '';

        if (artist.tracklist.length > 0) {
          this.currentSong = artist.tracklist[0];
        }

        // Set releases with high-res covers
        this.releases = Array.isArray(releases?.albums)
          ? releases.albums.map((release) => ({
              ...release,
              cover: this.getHighQualityImage(release.cover),
            }))
          : [];

        this.isLoadingExtraDetails = false;
        if (done) done();
      },
      error: () => {
        const artist = this.record as Artist;
        artist.tracklist = [];
        this.releases = [];
        this.isLoadingExtraDetails = false;
        if (done) done();
      },
      complete: () => {
        const players = [this.audioPlayerMobile, this.audioPlayerDesktop];
        players.forEach((player) => player?.stopLoading());
      },
    });
  }

  markTrackImageLoaded(i: number): void {
    this.trackImageLoaded[i] = true;
  }

  isTrackImageLoaded(i: number): boolean {
    return this.trackImageLoaded[i] === true;
  }

  markReleaseImageLoaded(i: number): void {
    this.releaseImageLoaded[i] = true;
  }

  isReleaseImageLoaded(i: number): boolean {
    return this.releaseImageLoaded[i] === true;
  }

  getHighQualityImage(imageUrl: string): string {
    if (!imageUrl) return '';

    // Ensure we're requesting the highest resolution available
    if (imageUrl.includes('api.deezer.com')) {
      return `${imageUrl}?size=xl`;
    }

    return imageUrl;
  }

  onAudioPlayStarted(previewUrl: string): void {
    if (this.record?.type !== 'Song' && (this.record as Album | Artist)?.tracklist) {
      const tracklist = (this.record as Album | Artist).tracklist;
      tracklist.forEach((track) => {
        track.isPlaying = track.preview === previewUrl;
      });

      const matched = tracklist.find((t) => t.preview === previewUrl);
      if (matched) {
        this.currentSong = matched;
      }
    }
  }

  stopAllAudioAndResetState(): void {
    console.log('🔇 Stopping all audio and resetting state...');

    this.audioPlayerMobile?.stop();
    this.audioPlayerDesktop?.stop();

    // Reset all track isPlaying flags
    if (this.record.type !== 'Song' && (this.record as Album | Artist)?.tracklist) {
      (this.record as Album | Artist).tracklist.forEach(
        (track) => (track.isPlaying = false)
      );
    }

    const rogueAudios = document.querySelectorAll('audio');
    rogueAudios.forEach((audioEl) => {
      audioEl.pause();
      audioEl.currentTime = 0;
      audioEl.src = ''; // Unset src to force browser to kill it
      audioEl.load(); // Force refresh/reset
    });

    this.currentSong = null;
  }

  nextSong() {
    this.stopAllAudioAndResetState();

    if (this.record.type !== 'Song') {
      (this.record as Album | Artist)?.tracklist?.forEach(
        (track) => (track.isPlaying = false)
      );
    }

    if (this.currentIndex < this.recordList.length - 1) {
      this.currentIndex++;
      this.record = this.recordList[this.currentIndex];

      this.resetForNewRecord();
    }
  }

  prevSong() {
    this.stopAllAudioAndResetState();

    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.record = this.recordList[this.currentIndex];

      this.resetForNewRecord();
    }
  }

  resetForNewRecord() {
    this.isSingleAlbum = false;
    this.isReviewsLoaded = false;
    this.isRatingLoaded = false;
    this.isImageLoaded = false;
    this.smartLinkUrl = '';
    this.trackImageLoaded = {};
    this.releaseImageLoaded = {};
    this.hasPlayedLoadTenCelebration = false;

    this.resetScrollingState();
    this.scrollToTopOfIpod();
    this.openRecord();
    this.updateIsInList();
  }

  openSongOrAlbum(record: Song | Album) {
    // Stop any currently playing audio
    this.audioPlayerMobile?.stop();
    this.audioPlayerDesktop?.stop();

    this.openNewReview.emit(record);
  }

  // From the back of ipod (albums and artists)
  playTrack(song: Song) {
    if (this.record.type !== 'Song') {
      const wasPlaying = song.isPlaying;

      // Pause all tracks
      (this.record as Album | Artist).tracklist?.forEach(
        (s) => (s.isPlaying = false)
      );

      const targetPlayer = this.isMobileView
        ? this.audioPlayerMobile
        : this.audioPlayerDesktop;

      if (!wasPlaying) {
        song.isPlaying = true;
        this.currentSong = song;

        setTimeout(() => {
          targetPlayer?.setSource(song.preview); // handles play internally
        });
      } else {
        targetPlayer?.togglePlay();
      }
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
    if (this.isCinemaRecord) {
      this.submitCinemaRating();
      return;
    }

    this.isCreateLoading = true;
    const record = this.musicRecord;

    // Build the command model
    const reviewCommand: CreateReviewCommandModel = {
      albumSongOrArtist: {
        id: record.id,
        type: record.type,
        wasOriginallyAlbumButTreatedAsSingle: false,
        title: record.type !== 'Artist' ? record.title : undefined, // Only for Albums & Songs
        name: record.type === 'Artist' ? record.name : record.artist, // Artists use 'name', Albums/Songs use 'artist'
        cover: record.type !== 'Artist' ? record.cover : undefined, // Only for Albums & Songs
        picture: record.type === 'Artist' ? record.picture : undefined, // Only for Artists
        artist: record.type !== 'Artist' ? record.artist : undefined, //  Only for Albums & Songs
        isExplicit: record.type === 'Song' ? record.isExplicit : undefined, // Only for Songs
        album: record.type === 'Song' ? record.album : undefined, // Only for Songs
        genre:
          record.type === 'Song' || record.type === 'Album'
            ? record.genre || 'Unknown'
            : undefined, // Only attach genre if it's a Song or Album
      },
      rating: this.newRating,
      reviewText: this.newReview,
    };

    // Artist activity feed and Marquee all return Albums, yet some are Albums with only one track (Single)
    if (record.type === 'Album' && record.tracklist?.length === 1) {
      reviewCommand.albumSongOrArtist.type = 'Song';
      reviewCommand.albumSongOrArtist.wasOriginallyAlbumButTreatedAsSingle =
        true;
    }

    this.reviewService.createReview(reviewCommand).subscribe({
      next: (data: NewReviewResponse) => {
        const type = data.review.albumSongOrArtist?.type;

        this.existingUserReview = {
          ...data.review,
          albumSongOrArtist: {
            ...data.review.albumSongOrArtist,
            effectiveType: type,
          },
        };
        this.reviewCreated.emit(data.review);

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

  // The "Add" flow for cinema - the CinemaItem already exists (from
  // import/watchlist), so this just sets its rating/text for the first time
  // via the same endpoint the "Refine" UI uses.
  submitCinemaRating() {
    this.isCreateLoading = true;
    const cinemaItem = this.cinemaRecord;

    if (!cinemaItem) {
      this.isCreateLoading = false;
      return;
    }

    this.cinemaService
      .editCinemaItem(cinemaItem._id, this.newRating, this.newReview)
      .subscribe({
        next: ({ data }) => {
          cinemaItem.decimalRating = data.decimalRating;
          cinemaItem.reviewText = data.reviewText;
          cinemaItem.isUnrefinedImport = data.isUnrefinedImport;

          const newReview = this.mapCinemaItemToOwnReview(data);
          this.existingUserReview = newReview;
          this.reviews = [...this.reviews, newReview];
          this.reviewCreated.emit(newReview);

          this.isAddingReview = false;
          this.isCreateLoading = false;

          this.ratingBarFill = this.getAverageRating() * 10;
          setTimeout(() => {
            this.circleDashOffset =
              113.1 - (this.getAverageRating() / 10) * 113.1;
          }, 50);
          this.toastr.success('Review created successfully.', 'Success');
        },
        error: () => {
          this.toastr.error('Error occurred while creating review.', 'Error');
          this.isCreateLoading = false;
        },
      });
  }

  toggleEditReview(review: Review) {
    this.isEditingReview = true;
    this.editedRating = review.rating;
    this.editedReviewText = review.reviewText;
    this.previousEditedRating = review.rating;
    this.editRatingDirection = null;
    this.tenCelebrationParticles = [];
  }

  cancelEditReview() {
    this.isEditingReview = false;
    clearTimeout(this.tenCelebrationTimeout);
    clearTimeout(this.tenCelebrationClearTimeout);
    this.tenCelebrationParticles = [];
  }

  // Detects whether the Edit Review slider just moved up or down so the
  // rating ring can flash green/red accordingly, then clears the flash.
  onEditRatingSlide(event: Event): void {
    this.onEditRatingChange(Number((event.target as HTMLInputElement).value));
  }

  // Shared by the slider and the direct number input.
  onEditRatingChange(newValue: number): void {
    if (newValue > this.previousEditedRating) {
      this.editRatingDirection = 'up';
    } else if (newValue < this.previousEditedRating) {
      this.editRatingDirection = 'down';
    }

    this.previousEditedRating = newValue;

    clearTimeout(this.editRatingDirectionTimeout);
    this.editRatingDirectionTimeout = setTimeout(() => {
      this.editRatingDirection = null;
    }, 400);

    this.checkForTenCelebration(newValue);
  }

  isMaxRating(rating: number): boolean {
    return Math.round((rating || 0) * 10) / 10 >= 10;
  }

  // Solid phase color per range (still state) - up to 4.9 red, 5-6.4 orange,
  // 6.5-7.4 yellow, 7.5-8.9 green, 9-10 blue. Each phase gets a subtle
  // same-hue two-tone gradient rather than a single flat color.
  getEditRingPhaseColors(rating: number): { start: string; end: string } {
    const r = rating || 0;

    if (r < 5) return { start: '#ef4444', end: '#f87171' };
    if (r < 6.5) return { start: '#f97316', end: '#fb923c' };
    if (r < 7.5) return { start: '#eab308', end: '#a3e635' };
    if (r < 9) return { start: '#22c55e', end: '#2dd4bf' };
    return { start: '#38bdf8', end: '#2563eb' };
  }

  // Once the rating settles on exactly 10 (unchanged for 1s), plays a
  // one-off confetti burst; the white halo glow itself is driven separately
  // by isMaxRating() so it persists after the confetti finishes.
  private checkForTenCelebration(rating: number): void {
    clearTimeout(this.tenCelebrationTimeout);

    if (!this.isMaxRating(rating)) {
      return;
    }

    this.tenCelebrationTimeout = setTimeout(() => {
      if (this.isMaxRating(this.editedRating)) {
        this.spawnTenCelebrationConfetti();
      }
    }, 1000);
  }

  // Plays the confetti burst once when the mobile Overall Rating ring first
  // loads showing a perfect 10 (as opposed to reaching 10 while editing).
  private checkForLoadTenCelebration(): void {
    if (this.hasPlayedLoadTenCelebration) return;
    if (!this.isMaxRating(this.getAverageRating())) return;

    this.hasPlayedLoadTenCelebration = true;
    this.spawnTenCelebrationConfetti();
  }

  private spawnTenCelebrationConfetti(): void {
    const colors = [
      '#f43f5e',
      '#ef4444',
      '#f97316',
      '#f59e0b',
      '#eab308',
      '#84cc16',
      '#22c55e',
      '#14b8a6',
      '#3b82f6',
      '#6366f1',
      '#a855f7',
      '#ec4899',
      '#ffffff',
    ];

    // Each particle starts on the ring and shoots outward along its own
    // angle, past the ring's edge, for a "bursting away" look.
    this.tenCelebrationParticles = Array.from({ length: 28 }, () => {
      const angle = Math.random() * 2 * Math.PI;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const outwardDistance = 14 + Math.random() * 16;

      return {
        cx: 21 + 18 * cos,
        cy: 21 + 18 * sin,
        px: cos * outwardDistance,
        py: sin * outwardDistance,
        key: this.tenCelebrationParticleId++,
        color: colors[Math.floor(Math.random() * colors.length)],
      };
    });

    clearTimeout(this.tenCelebrationClearTimeout);
    this.tenCelebrationClearTimeout = setTimeout(() => {
      this.tenCelebrationParticles = [];
    }, 1500);
  }

  trackEditRatingParticle(index: number, particle: { key: number }): number {
    return particle.key;
  }

  submitEditReview() {
    if (this.isCinemaRecord) {
      this.submitCinemaEditReview();
      return;
    }

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

            this.reviewEdited.emit(data.review);

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

  submitCinemaEditReview() {
    this.isEditLoading = true;
    if (!this.existingUserReview?._id) {
      this.isEditLoading = false;
      return;
    }

    this.cinemaService
      .editCinemaItem(
        this.existingUserReview._id,
        this.editedRating,
        this.editedReviewText
      )
      .subscribe({
        next: ({ data }) => {
          const updated = this.mapCinemaItemToOwnReview(data);
          this.existingUserReview = updated;
          this.reviews = this.reviews.map((review) =>
            review._id === updated._id ? updated : review
          );
          this.reviewEdited.emit(updated);

          if (this.cinemaRecord) {
            this.cinemaRecord.decimalRating = data.decimalRating;
            this.cinemaRecord.reviewText = data.reviewText;
            this.cinemaRecord.isUnrefinedImport = data.isUnrefinedImport;
          }

          this.isEditingReview = false;
          this.isEditLoading = false;
          this.ratingBarFill = this.getAverageRating() * 10;
          setTimeout(() => {
            this.circleDashOffset =
              113.1 - (this.getAverageRating() / 10) * 113.1;
          }, 50);
          this.toastr.success('Review edited successfully.', 'Success');
        },
        error: () => {
          this.isEditLoading = false;
          this.toastr.error('Error occurred while editing review.', 'Error');
        },
      });
  }

  deleteReview(review: Review) {
    this.isDeleteLoading = true;
    if (this.existingUserReview && this.existingUserReview._id) {
      const type = this.isCinemaRecord ? 'cinema' : undefined;
      this.reviewService.deleteReview(review._id, type).subscribe({
        next: () => {
          this.reviews = this.reviews.filter((r) => r._id !== review._id);
          this.existingUserReview = null;
          this.isDeleteLoading = false;
          this.reviewDeleted.emit(review);
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

  showdeleteConfirmation(review: Review) {
    const modalOptions: NgbModalOptions = {
      backdrop: false,
      centered: true,
    };

    const modalRef = this.modal.open(ConfirmationModalComponent, modalOptions);
    modalRef.componentInstance.title = `Remove review`;
    modalRef.componentInstance.bodyText = `Are you sure you want to delete this review?`;

    modalRef.componentInstance.confirm.subscribe(() => {
      this.deleteReview(review);
      modalRef.close();
    });

    modalRef.componentInstance.cancel.subscribe(() => {
      modalRef.close();
    });
  }

  updatePlayStatus(status: boolean) {
    this.isPlaying = status;

    if (this.record.type !== 'Song') {
      (this.record as Album | Artist).tracklist?.forEach((track) => {
        track.isPlaying = this.currentSong?.id === track.id && status;
      });
    }
  }

  onBackClick() {
    this.showSecondIpod = false;
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

  // Drives the blue progress ring in the Edit Review form - distinct from
  // the yellow/orange "average rating" ring used elsewhere in this component.
  getEditRingDashOffset(value: number): number {
    const clamped = Math.min(Math.max(value || 0, 0), 10);
    return 113.1 - (clamped / 10) * 113.1;
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

    return `linear-gradient(
    to right,
    #0ea5e9 0%,
    #2563eb ${adjustedPercent}%,
    #3f3f46 ${adjustedPercent}%,
    #3f3f46 100%
  )`;
  }

  get isTracklistArray(): boolean {
    const tracklist = (this.record as Album | Artist)?.tracklist;
    return Array.isArray(tracklist) && tracklist.length > 0;
  }

  getAverageRating(): number {
    if (!this.reviews || this.reviews.length === 0) {
      // Before the community reviews finish loading, fall back to this
      // cinema record's own rating so the circle doesn't flash 0.
      return this.isCinemaRecord ? this.cinemaRecord?.decimalRating ?? 0 : 0;
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

  addToArtistList(artist: Artist) {
    this.addingToList = true;

    const itemToAdd: FollowedArtist = {
      id: artist.id.toString(),
      name: artist.name,
      picture: artist.picture,
      addedAt: new Date(),
      tracklist: artist.tracklist || [],
      preview: artist.preview || '',
    };

    this.userService.addToArtistList(itemToAdd).subscribe({
      next: () => {
        this.toastr.success('Artist followed!', 'Success');

        if (!this.userProfile.artistList) this.userProfile.artistList = [];
        this.userProfile.artistList.push(itemToAdd);
        this.userService.setUserProfile(this.userProfile);

        this.isInList = true;

        //  Trigger backend sync
        this.searchService
          .syncArtistAlbums(itemToAdd.id, itemToAdd.name)
          .subscribe({
            next: () => {},
            error: () =>
              console.log(`Failed to sync albums for ${itemToAdd.name}`),
          });

        this.addingToList = false;
      },
      error: () => {
        this.toastr.error('Failed to follow artist.', 'Error');
        this.addingToList = false;
      },
    });
  }

  removeFromArtistList(artist: Artist) {
    this.addingToList = true;

    const id = artist.id.toString();

    this.userService.removeFromArtistList({ id }).subscribe({
      next: () => {
        this.toastr.success('Removed from your list!', 'Success');
        this.isInList = false;
        this.addingToList = false;

        // Update local userProfile.artistList
        this.userProfile.artistList = this.userProfile.artistList?.filter(
          (item) => item.id !== id
        );

        // Push updated profile to global observable
        this.userService.setUserProfile(this.userProfile);
      },
      error: () => {
        this.toastr.error('Failed to remove artist.', 'Error');
        this.addingToList = false;
      },
    });
  }

  goToProfile(userId: string) {
    this.userNavigated.emit();
    this.close();
    this.router.navigate(['/profile', userId], {
      state: { section: this.activeDiscoverTab },
    });
  }

  get trackSummary() {
    if (this.record.type == 'Album') {
      return this.getTrackSummaryParts(this.record.tracklist);
    }
    return;
  }

  getTrackSummaryParts(tracklist: Song[]): {
    count: number;
    durationDisplay: string;
  } {
    const totalTracks = tracklist.length;
    const totalSeconds = tracklist.reduce((sum, t) => sum + t.duration, 0);

    let durationDisplay = '';

    if (totalTracks === 1) {
      const min = Math.floor(totalSeconds / 60);
      const sec = totalSeconds % 60;
      durationDisplay = `${min}:${sec.toString().padStart(2, '0')}`;
    } else {
      const totalMinutes = Math.floor(totalSeconds / 60);
      durationDisplay = `${totalMinutes} min`;
    }

    return { count: totalTracks, durationDisplay };
  }

  getSongDurationDisplay(song: Song): string {
    const totalSeconds = song.duration || 0;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  toggleLike(review: Review) {
    // 1. Trigger the animation
    this.animateHeart[review._id] = true;

    // 2. Stop animation after 300ms
    setTimeout(() => {
      this.animateHeart[review._id] = false;
    }, 300);

    const originalLiked = review.likedByCurrentUser ?? false;
    const originalLikes = review.likes;

    review.likedByCurrentUser = !originalLiked;
    review.likes += review.likedByCurrentUser ? 1 : -1;

    const type = this.isCinemaRecord ? 'cinema' : undefined;
    this.reviewService.toggleLike(review._id, type).subscribe({
      next: (res) => {
        review.likes = res.likes;
        review.likedByCurrentUser = res.likedByUser;
      },
      error: (err) => {
        review.likedByCurrentUser = originalLiked;
        review.likes = originalLikes;
        console.error('Failed to toggle like:', err);
      },
    });
  }

  transformCloudinaryUrl(url: string): string {
    if (!url.includes('res.cloudinary.com')) return url;

    return url.replace(
      /\/upload\//,
      '/upload/w_1600,h_1600,c_fill,g_face,f_auto,q_auto,dpr_auto/'
    );
  }
}
