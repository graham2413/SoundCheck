import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { UserService } from '../../services/user.service';
import { CommonModule } from '@angular/common';
import { ToastrService } from 'ngx-toastr';
import { Friend } from 'src/app/models/responses/friend-response';
import { FormsModule } from '@angular/forms';
import { NgbModal, NgbModalOptions, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { ReviewPageComponent } from '../review-page/review-page.component';
import { Album } from 'src/app/models/responses/album-response';
import { Artist } from 'src/app/models/responses/artist-response';
import { Song } from 'src/app/models/responses/song-response';
import { Review } from 'src/app/models/responses/review-responses';
import { User } from 'src/app/models/responses/user.response';
import { ConfirmationModalComponent } from '../friends-page/confirmation-modal/confirmation-modal.component';
import { TimeAgoPipe } from 'src/app/shared/timeAgo/time-ago.pipe';
import { AppComponent } from 'src/app/app.component';
import { BaseRecord } from 'src/app/models/responses/base-record';

type ModalRecord = Album | Song | Artist | BaseRecord;
@Component({
  selector: 'app-view-profile-page',
  imports: [CommonModule, FormsModule, TimeAgoPipe],
  templateUrl: './other-profile-page.component.html',
  styleUrl: './other-profile-page.component.css',
  standalone: true,
})
export class ViewProfilePageComponent implements OnInit {
  otherUserId!: string;
  otherUser: User | null = null;
  searchQuery: string = '';
  filteredFriends: Friend[] = [];
  loggedInUser: User = {
    _id: '',
    username: '',
    gradient: '',
    createdAt: '',
    reviews: [],
    googleId: '',
    email: '',
    friends: [],
    profilePicture: '',
    list: [],
    friendInfo: {
      friends: [],
      friendRequestsReceived: [],
      friendRequestsSent: [],
    },
  } as User;

  isLoadingFriendAction: boolean = false;
  isImageModalOpen: boolean = false;
  showPanel: 'reviews' | 'friends' | 'list' | null = null;
  reviewsByType = { songs: 0, albums: 0, artists: 0 };
  averageRating = 0;
  mostReviewedGenre: string = 'Unknown';
  totalGenresReviewed: number = 0;
  mostReviewedArtist: string = 'Unknown';
  longestReviewStreak: number = 0;
  totalWordsWritten: number = 0;
  averageWordsPerReview: number = 0;
  userBadges: string[] = [];
  isBadgesOverlayOpen = false;
  selectedBadge: {
    name: string;
    description: string;
    unlocked: boolean;
  } | null = null;
  allBadges = [
    {
      name: 'The Critic',
      description: 'Write 25 or more reviews.',
      unlocked: false,
    },
    {
      name: 'Genre Bender',
      description: 'Review 10 or more different genres.',
      unlocked: false,
    },
    {
      name: 'Early Adopter',
      description: 'Post your first review within 30 days of account creation.',
      unlocked: false,
    },
  ];
  decliningFriendRequest: boolean = false;
  gradientPresets = [
    { name: 'Indigo to Purple', value: 'from-indigo-600 to-purple-500' },
    { name: 'Blue to Cyan', value: 'from-blue-500 to-cyan-500' },
    { name: 'Pink to Red', value: 'from-pink-500 to-red-500' },
    { name: 'Green to Lime', value: 'from-green-500 to-lime-500' },
    { name: 'Yellow to Orange', value: 'from-yellow-400 to-orange-500' },
  ];

  currentGradient = '';
  tempSelectedGradient = '';
  isGradientModalOpen = false;
  showTypeDropdown = false;
  selectedType: 'All' | 'Song' | 'Album' | 'Artist' = 'All';
  recordTypes: ('Song' | 'Album' | 'Artist')[] = ['Song', 'Album', 'Artist'];

  constructor(
    private route: ActivatedRoute,
    private userService: UserService,
    private toastr: ToastrService,
    private router: Router,
    private modal: NgbModal,
    private appComponent: AppComponent
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe((params) => {
      this.otherUserId = params['userId'];
      this.otherUser = null;
      window.scrollTo(0, 0);

      this.userService.userProfile$.subscribe((profile) => {
        this.loggedInUser = profile;

        // Fetch only after loggedInUser is available
        if (this.loggedInUser) {
          this.fetchUserDetails();
        }
      });
    });
  }

getTransformedImageUrl(fullUrl: string): string {
  if (!fullUrl) {
    return 'assets/otherUser.png'; // fallback
  }

  return fullUrl.replace(
    '/upload/',
    '/upload/w_1600,h_1600,c_fill,g_face,f_auto,q_auto,dpr_auto/'
  );
}


getTransformedImageSmallUrl(fullUrl: string): string {
  if (!fullUrl) {
    return 'assets/otherUser.png'; // fallback
  }

  return fullUrl.replace(
    '/upload/',
    '/upload/w_400,f_auto,q_auto/'
  );
}


  public fetchUserDetails() {
    this.userService.getOtherUserProfileInfo(this.otherUserId).subscribe({
      next: (response) => {
        // Check if the logged-in user is already friends with the viewed user
        const isFriend = this.loggedInUser?.friendInfo?.friends?.some(
          (friend) => friend._id === response._id
        );

        // Only true if a request was sent and they aren't already friends
        const hasPendingRequestSent =
          !isFriend &&
          this.loggedInUser?.friendInfo?.friendRequestsSent?.some(
            (req) => req._id === response._id
          );

        // Only true if a request was received and they aren't already friends
        const hasPendingRequestReceived =
          !isFriend &&
          this.loggedInUser?.friendInfo?.friendRequestsReceived?.some(
            (req) => req._id === response._id
          );

        this.otherUser = {
          ...response,
          isFriend,
          hasPendingRequestSent,
          hasPendingRequestReceived,
        };

        // Uncomment for mock data testing friends and reviews
        // if (this.otherUser) {
        //   this.otherUser.friends = this.generateMockFriends(30);
        // }
        // this.otherUser.reviews = this.generateMockReviews(10);

        this.filteredFriends = [...(this.otherUser?.friends ?? [])];

        if (this.otherUser?.reviews) {
          this.reviewsByType = this.calculateReviewsByType(
            this.otherUser.reviews
          );
          this.averageRating = this.calculateAverageRating(
            this.otherUser.reviews
          );
          this.getMostReviewedGenreAndCount();
          this.getMostReviewedArtist();
          this.getLongestReviewStreak();
          this.getTotalAndAverageWordsWritten();
          this.calculateUserBadges();
        } else {
          this.reviewsByType = { songs: 0, albums: 0, artists: 0 };
        }
      },
      error: () => {
        this.toastr.error('Error retrieving User Profile', 'Error');
      },
    });
  }

  calculateReviewsByType(reviews: Review[]): {
    songs: number;
    albums: number;
    artists: number;
  } {
    const stats = { songs: 0, albums: 0, artists: 0 };

    for (const review of reviews) {
      const type = review.albumSongOrArtist.type;
      if (type === 'Song') stats.songs++;
      else if (type === 'Album') stats.albums++;
      else if (type === 'Artist') stats.artists++;
    }

    return stats;
  }

  calculateAverageRating(reviews: Review[]): number {
    if (!reviews || reviews.length === 0) return 0;

    const totalRating = reviews.reduce(
      (sum, review) => sum + (review.rating || 0),
      0
    );
    const average = totalRating / reviews.length;

    return Math.round(average * 10) / 10;
  }

  getMostReviewedGenreAndCount() {
    if (!this.otherUser?.reviews || this.otherUser.reviews.length === 0) {
      this.mostReviewedGenre = 'Unknown';
      this.totalGenresReviewed = 0;
      return;
    }

    const genreCounts: { [genre: string]: number } = {};

    this.otherUser?.reviews.forEach((review) => {
      const item = review.albumSongOrArtist;

      if (item?.type === 'Album' || item?.type === 'Song') {
        const genre = item.genre?.trim();
        if (genre && genre !== '') {
          genreCounts[genre] = (genreCounts[genre] || 0) + 1;
        }
      }
    });

    const sortedGenres = Object.entries(genreCounts).sort(
      (a, b) => b[1] - a[1]
    );

    this.mostReviewedGenre =
      sortedGenres.length > 0 ? sortedGenres[0][0] : 'Unknown';
    this.totalGenresReviewed = Object.keys(genreCounts).length;
  }

  getMostReviewedArtist() {
    if (!this.otherUser?.reviews || this.otherUser.reviews.length === 0) {
      this.mostReviewedArtist = 'Unknown';
      return;
    }

    const artistCounts: { [artistName: string]: number } = {};

    this.otherUser.reviews.forEach((review) => {
      const item = review.albumSongOrArtist;

      if (item?.type === 'Album' || item?.type === 'Song') {
        const artist = item.artist?.trim();
        if (artist && artist !== '') {
          artistCounts[artist] = (artistCounts[artist] || 0) + 1;
        }
      }
    });

    const sortedArtists = Object.entries(artistCounts).sort(
      (a, b) => b[1] - a[1]
    );

    this.mostReviewedArtist =
      sortedArtists.length > 0 ? sortedArtists[0][0] : 'Unknown';
  }

  getLongestReviewStreak() {
    if (!this.otherUser?.reviews || this.otherUser.reviews.length === 0) {
      this.longestReviewStreak = 0;
      return;
    }

    // Step 1: Extract and normalize dates
    const reviewDates = this.otherUser.reviews
      .map((review) => new Date(review.createdAt).toISOString().split('T')[0]) // only keep YYYY-MM-DD
      .sort(); // Sort dates ascending

    let longestStreak = 1;
    let currentStreak = 1;

    for (let i = 1; i < reviewDates.length; i++) {
      const prevDate = new Date(reviewDates[i - 1]);
      const currentDate = new Date(reviewDates[i]);

      const diffInDays =
        (currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);

      if (diffInDays === 1) {
        currentStreak++;
        longestStreak = Math.max(longestStreak, currentStreak);
      } else if (diffInDays > 1) {
        currentStreak = 1; // Reset streak
      }
      // If diffInDays === 0 (multiple reviews same day), just continue without resetting
    }

    this.longestReviewStreak = longestStreak;
  }

  getTotalAndAverageWordsWritten() {
    if (!this.otherUser?.reviews || this.otherUser.reviews.length === 0) {
      this.totalWordsWritten = 0;
      this.averageWordsPerReview = 0;
      return;
    }

    let totalWords = 0;

    this.otherUser.reviews.forEach((review) => {
      if (review.reviewText) {
        const wordCount = review.reviewText.trim().split(/\s+/).length;
        totalWords += wordCount;
      }
    });

    this.totalWordsWritten = totalWords;
    this.averageWordsPerReview = parseFloat(
      (totalWords / this.otherUser.reviews.length).toFixed(2)
    );
  }

  calculateUserBadges() {
    if (!this.otherUser) return;

    const reviews = this.otherUser.reviews || [];
    const totalReviews = reviews.length;

    const genres = new Set<string>();
    let firstReviewDate: Date | null = null;

    reviews.forEach((review) => {
      const item = review.albumSongOrArtist;
      if (item?.type === 'Album' || item?.type === 'Song') {
        const genre = item.genre?.trim();
        if (genre) genres.add(genre);
      }

      const createdAt = new Date(review.createdAt);
      if (!firstReviewDate || createdAt < firstReviewDate) {
        firstReviewDate = createdAt;
      }
    });

    const earnedBadges = new Set<string>();

    if (totalReviews >= 25) earnedBadges.add('The Critic');
    if (genres.size >= 10) earnedBadges.add('Genre Bender');

    if (firstReviewDate && this.otherUser.createdAt) {
      const firstReview = new Date(firstReviewDate);
      const accountCreation = new Date(this.otherUser.createdAt);

      const daysSinceAccountCreation =
        (firstReview.getTime() - accountCreation.getTime()) /
        (1000 * 60 * 60 * 24);

      if (daysSinceAccountCreation <= 30) {
        earnedBadges.add('Early Adopter');
      }
    }

    // Update allBadges unlocked status
    this.allBadges = this.allBadges
      .map((badge) => ({
        ...badge,
        unlocked: earnedBadges.has(badge.name),
      }))
      .sort((a, b) => (a.unlocked === b.unlocked ? 0 : a.unlocked ? -1 : 1));
  }

  openBadgesOverlay(badge?: {
    name: string;
    description: string;
    unlocked: boolean;
  }) {
    this.selectedBadge = badge || null;
    this.isBadgesOverlayOpen = true;
  }

  closeBadgesOverlay() {
    this.isBadgesOverlayOpen = false;
    this.selectedBadge = null;
  }

  showBadgeInfo(badge: {
    name: string;
    description: string;
    unlocked: boolean;
  }) {
    this.selectedBadge = badge;
  }

  get unlockedBadges() {
    return this.allBadges.filter((b) => b.unlocked);
  }

  formatNumber(value: number): string {
    if (value >= 1000) {
      return (value / 1000).toFixed(1) + 'k';
    }
    return value.toString();
  }

  toggleTypeDropdown() {
    this.showTypeDropdown = !this.showTypeDropdown;
  }

  filterByType(type: 'Song' | 'Album' | 'Artist') {
    this.selectedType = type;
    this.showTypeDropdown = false;
  }

  clearTypeFilter() {
    this.selectedType = 'All';
    this.showTypeDropdown = false;
  }

  get filteredList() {
    if (this.selectedType === 'All') {
      return this.otherUser?.list || [];
    }
    return (this.otherUser?.list || []).filter(
      (item) => item.type === this.selectedType
    );
  }

  sendFriendRequest(user: User) {
    this.isLoadingFriendAction = true;

    this.userService.sendFriendRequest(user._id).subscribe({
      next: (response) => {
        this.toastr.success(response.message, 'Success');
        this.isLoadingFriendAction = false;

        // Update UI flags
        user.hasPendingRequestSent = true;
        user.hasPendingRequestReceived = false;
        user.isFriend = false;

        // Add to current user's sent requests
        this.loggedInUser.friendInfo.friendRequestsSent.push({
          _id: user._id,
          username: user.username,
          profilePicture: user.profilePicture,
          email: '',
          list: [],
          googleId: '',
          createdAt: '',
          friends: [],
          gradient: '',
          reviews: [],
          friendInfo: {
            friends: [],
            friendRequestsSent: [],
            friendRequestsReceived: [],
          },
        });

        this.userService.setUserProfile(this.loggedInUser);
      },
      error: (error) => {
        this.isLoadingFriendAction = false;
        this.toastr.error(
          error.error?.message || 'Error sending request',
          'Error'
        );
      },
    });
  }

  declineFriendRequest(fromUser: User) {
    this.decliningFriendRequest = true;
    this.userService.declineFriendRequest(fromUser._id).subscribe({
    next: (_: unknown) => {
        if (
          this.loggedInUser &&
          this.loggedInUser.friendInfo.friendRequestsReceived
        ) {
          this.loggedInUser.friendInfo.friendRequestsReceived =
            this.loggedInUser.friendInfo.friendRequestsReceived.filter(
              (r) => r._id !== fromUser._id
            );
        }

        // update the global profile
        this.userService.setUserProfile(this.loggedInUser);
        this.decliningFriendRequest = true;
        this.toastr.success('Friend request declined', 'Success');
      },
      error: (error: { error?: { message?: string } }) => {
        this.decliningFriendRequest = true;
        this.toastr.error(
          error.error?.message || 'Error removing request',
          'Error'
        );
      },
    });
  }

  acceptFriendRequest(fromUser: User) {
    this.isLoadingFriendAction = true;
    this.userService.acceptFriendRequest(fromUser._id).subscribe({
      next: (response) => {
        if (this.loggedInUser) {
          this.loggedInUser.friendInfo.friendRequestsReceived =
            this.loggedInUser.friendInfo.friendRequestsReceived?.filter(
              (r) => r._id !== fromUser._id
            ) || [];

          const alreadyFriend = this.loggedInUser.friendInfo.friends.some(
            (f) => f._id === fromUser._id
          );

          if (!alreadyFriend) {
            this.loggedInUser.friendInfo.friends.push({
              _id: fromUser._id,
              username: fromUser.username,
              reviews: [],
              friends: [],
              profilePicture: fromUser.profilePicture,
              email: '',
              createdAt: '',
              list: [],
              gradient: '',
              googleId: '',
              friendInfo: {
                friends: [],
                friendRequestsSent: [],
                friendRequestsReceived: [],
              },
            });
          }
        }

        if (this.otherUser && this.otherUser._id === fromUser._id) {
          this.otherUser.isFriend = true;
          this.otherUser.hasPendingRequestReceived = false;
          this.otherUser.hasPendingRequestSent = false;
        }

        this.isLoadingFriendAction = false;
        this.toastr.success(response.message, 'Success');

        this.userService.setUserProfile(this.loggedInUser);
      },
      error: (error) => {
        this.isLoadingFriendAction = false;
        this.toastr.error(
          error.error?.message || 'Error sending request',
          'Error'
        );
      },
    });
  }

  openModal(friend: Friend) {
    const modalOptions: NgbModalOptions = {
      backdrop: false,
      centered: true,
    };

    const modalRef = this.modal.open(ConfirmationModalComponent, modalOptions);
    modalRef.componentInstance.title = `Unfollow friend`;
    modalRef.componentInstance.bodyText = `Are you sure you want to unfollow ${friend.username}?`;

    modalRef.componentInstance.confirm.subscribe(() => {
      this.removeFriend(friend);
      modalRef.close();
    });

    modalRef.componentInstance.cancel.subscribe(() => {
      modalRef.close();
    });
  }

  removeFriend(friend: Friend) {
    this.isLoadingFriendAction = true;

    this.userService.removeFriend(friend._id).subscribe({
    next: (_: unknown) => {
        const { friendInfo } = this.loggedInUser;

        // Remove from friends
        friendInfo.friends = friendInfo.friends.filter(
          (f) => f._id !== friend._id
        );

        // Remove from sent/received requests just in case
        friendInfo.friendRequestsSent = friendInfo.friendRequestsSent.filter(
          (r) => r._id !== friend._id
        );
        friendInfo.friendRequestsReceived =
          friendInfo.friendRequestsReceived.filter((r) => r._id !== friend._id);

        // Reflect in viewed profile
        if (this.otherUser && this.otherUser._id === friend._id) {
          this.otherUser.isFriend = false;
          this.otherUser.hasPendingRequestSent = false;
          this.otherUser.hasPendingRequestReceived = false;
        }

        this.userService.setUserProfile(this.loggedInUser);
        this.toastr.success('Removed friend', 'Success');
        this.isLoadingFriendAction = false;
      },
      error: (error: { error?: { message?: string } }) => {
        this.toastr.error(
          error.error?.message || 'Error removing friend',
          'Error'
        );
        this.isLoadingFriendAction = false;
      },
    });
  }

  // generateMockReviews(count: number): Review[] {
  //   const dummyTitles = ['Roses', 'Blinding Lights', 'Circles', 'Peaches', 'Levitating'];
  //   const dummyImages = Array(5).fill('https://via.placeholder.com/150');

  //   const reviews: Review[] = [];

  //   for (let i = 0; i < count; i++) {
  //     reviews.push({
  //       _id: `mock-${i}`,
  //       rating: Math.floor(Math.random() * 10) + 1,
  //       reviewText: `This is a dummy review for ${dummyTitles[i % dummyTitles.length]}.`,
  //       createdAt: new Date(Date.now() - i * 86400000).toISOString(),
  //       albumOrSongId: `mock-song-${i}`,
  //       type: 'Song',
  //       __v: 0,
  //       user: {
  //         _id: this.otherUser._id,
  //         username: this.otherUser.username,
  //         email: this.otherUser.email,
  //         reviews: [],
  //         friendInfo: this.otherUser.friendInfo,
  //         googleId: this.otherUser.googleId,
  //         profilePicture: this.otherUser.profilePicture || 'default-profile.png'
  //       },
  //       albumSongOrArtist: {
  //         cover: dummyImages[i % dummyImages.length],
  //         title: dummyTitles[i % dummyTitles.length],
  //         type: 'Album' // or 'Song' or 'Artist'
  //       }
  //     });
  //   }
  //   return reviews;
  // }

  // generateMockFriends(count: number): any[] {
  //   return Array.from({ length: count }, (_, i) => ({
  //     username: `Friend ${i + 1}`,
  //     profilePicture: i % 2 === 0
  //       ? 'https://api.dicebear.com/7.x/avataaars/svg?seed=Friend' + (i + 1)
  //       : 'assets/user.png' // Alternating between avatars and default image
  //   }));
  // }

  openReviews() {
    if (this.otherUser?.reviews && this.otherUser.reviews.length > 0) {
      this.showPanel = 'reviews';
    }
  }

  openFriends() {
    if (this.otherUser?.friends && this.otherUser.friends.length > 0) {
      this.showPanel = 'friends';
    }
  }

  openList() {
    if (this.otherUser?.list && this.otherUser.list.length > 0) {
      this.showPanel = 'list';
    }
  }

  closePanel() {
    this.showPanel = null;
  }

buildFullRecord(item: BaseRecord): Album | Artist | Song {
  const numericId = typeof item.id === 'string' ? parseInt(item.id, 10) : item.id;

  if (item.type === 'Song') {
    return {
      id: numericId,
      type: 'Song',
      title: item.title ?? 'Unknown Title',
      artist: item.artist ?? 'Unknown Artist',
      album: item.album ?? '',
      cover: item.cover ?? '',
      genre: item.genre ?? 'Unknown',
      preview: item.preview ?? '',
      duration: item.duration ?? 0,
      isExplicit: item.isExplicit ?? false,
      releaseDate: item.releaseDate ?? '',
      contributors: item.contributors ?? [],
      isPlaying: item.isPlaying ?? false,
    };
  } else if (item.type === 'Album') {
    return {
      id: numericId,
      type: 'Album',
      title: item.title ?? 'Unknown Album',
      artist: item.artist ?? 'Unknown Artist',
      cover: item.cover ?? '',
      genre: item.genre ?? 'Unknown',
      releaseDate: item.releaseDate ?? '',
      tracklist: item.tracklist ?? [],
      isExplicit: item.isExplicit ?? false,
      preview: item.preview ?? '',
    };
  } else {
    return {
      id: numericId,
      type: 'Artist',
      name: item.name ?? 'Unknown Artist',
      picture: item.picture ?? '',
      tracklist: item.tracklist ?? [],
      preview: item.preview ?? '',
    };
  }
}


  get filteredFullRecordList(): (Album | Artist | Song)[] {
return (this.filteredList || []).map(item =>
  this.buildFullRecord({ ...item, id: parseInt(item.id, 10) })
);
  }


openReview(
  record: ModalRecord,
  recordList?: ModalRecord[],
  index?: number,
): NgbModalRef {
    const modalOptions: NgbModalOptions = {
      backdrop: false,
      keyboard: true,
      centered: true,
      scrollable: true,
    };

    const modalRef = this.modal.open(ReviewPageComponent, modalOptions);

    // Use passed list/index if available
    if (recordList && index !== undefined) {
      modalRef.componentInstance.recordList = recordList;
      modalRef.componentInstance.currentIndex = index;
    }

    modalRef.componentInstance.record = record;

    // 1. check for review edited
    modalRef.componentInstance.reviewEdited.subscribe(
      (updatedReview: Review) => {
        const i = this.otherUser?.reviews.findIndex(
          (a) => a._id === updatedReview._id
        );
        if (typeof i === 'number' && i !== -1) {
          const updated = {
            ...this.otherUser!.reviews![i],
            reviewText: updatedReview.reviewText,
            rating: updatedReview.rating,
            createdAt: updatedReview.createdAt,
          };
          this.otherUser!.reviews!.splice(i, 1);
          this.otherUser!.reviews!.unshift(updated);
          this.updateUserStats();
        }
      }
    );

    // 2. Check for review deleted
    modalRef.componentInstance.reviewDeleted?.subscribe(
      (deletedReview: Review) => {
          if (this.otherUser?.reviews) {
            this.otherUser.reviews = this.otherUser.reviews.filter(
              review => review._id !== deletedReview._id
            );
            this.updateUserStats();
          }
      }
    );

    // 3. Check for review created
    modalRef.componentInstance.reviewCreated?.subscribe((newReview: Review) => {
        if (this.otherUser?.reviews) {
          this.otherUser.reviews.unshift(newReview);
          this.updateUserStats();
        }
    });   
    
    // 4. Navigating to another profile
    modalRef.componentInstance.userNavigated.subscribe(() => {
      this.showPanel = null;
    });

    // 5. Handle opening a song frmo an artist or album review
    modalRef.componentInstance.openNewReview.subscribe((record: Song) => {
    
      // Upgrade the image before opening the modal
      const highResCover = this.getHighQualityImage(record.cover);
      const updatedRecord = { ...record, cover: highResCover };
    
      const newModal = this.openReview(updatedRecord, [], 0);
      newModal.componentInstance.showForwardAndBackwardButtons = false; // Hide buttons for this modal
      modalRef.close();
    });
    return modalRef;
  }

  getHighQualityImage(imageUrl: string): string {
    if (!imageUrl) return '';

    // Ensure we're requesting the highest resolution available
    if (imageUrl.includes('api.deezer.com')) {
      return `${imageUrl}?size=xl`;
    }

    return imageUrl;
  }

  updateUserStats() {
    if (this.otherUser?.reviews) {
      this.reviewsByType = this.calculateReviewsByType(this.otherUser.reviews);
      this.averageRating = this.calculateAverageRating(this.otherUser.reviews);
      this.getMostReviewedGenreAndCount();
      this.getMostReviewedArtist();
      this.getLongestReviewStreak();
      this.getTotalAndAverageWordsWritten();
      this.calculateUserBadges();
    }
  }

  filterFriends(): void {
    const query = this.searchQuery.toLowerCase().trim();
    this.filteredFriends =
      this.otherUser?.friends.filter((friend: { username: string }) =>
        friend.username.toLowerCase().includes(query)
      ) ?? [];
  }

  goToUserProfile(userId?: string): void {
    this.showPanel = null;
  
    const currentUserId = this.route.snapshot.paramMap.get('userId');
    const currentSection = history.state?.section;
  
    if (userId) {
      this.router.navigate([`/profile/${userId}`], {
        state: {
          fromUserId: currentUserId,
          section: currentSection
        }      });
    } else {
      this.router.navigate(['/profile']);
    }
  }

get reviewList(): ModalRecord[] {
  return this.otherUser?.reviews?.map(a =>
    this.buildFullRecord({ ...a.albumSongOrArtist, id: parseInt(a.albumSongOrArtist.id, 10) })
  ) ?? [];
}

prepareRecord(raw: any): ModalRecord {
  return this.buildFullRecord({ ...raw, id: parseInt(raw.id, 10) });
}

  goBack(): void {
    this.appComponent.navigationDirection = 'back';
  
    const section = history.state?.section;
    const previousUserId = history.state?.fromUserId;
  
    // 1. Go back to previous profile if available
    if (previousUserId) {
      this.router.navigate([`/profile/${previousUserId}`], {
        state: { section } // forward section if it exists
      });
      return;
    }
  
    // 2. If no previous profile, use section to route back to source
    if (section) {
      if (['addFriends', 'requests', 'myFriends'].includes(section)) {
        this.router.navigate(['/friends'], { state: { section } });
      } else if (['recentActivity', 'popular'].includes(section)) {
        this.router.navigate(['/'], { state: { section } });
      } else {
        this.router.navigate(['/']);
      }
    } else {
      this.router.navigate(['/']);
    }
  }
  
  

  openGradientModal() {
    this.tempSelectedGradient = this.currentGradient;
    this.isGradientModalOpen = true;
  }

  closeGradientModal() {
    this.isGradientModalOpen = false;
  }

  selectGradient(gradient: string) {
    this.tempSelectedGradient = gradient;
  }

  saveGradient() {
    if (!this.tempSelectedGradient) {
      this.isGradientModalOpen = false;
      return;
    }

    const formData = new FormData();
    formData.append('gradient', this.tempSelectedGradient);

    this.userService.updateUserProfile(formData).subscribe({
      next: (updatedUser) => {
        this.loggedInUser = {
          ...this.loggedInUser,
          gradient: updatedUser.gradient,
        };
        this.userService.setUserProfile(this.loggedInUser);
        this.currentGradient = updatedUser.gradient || '';
        this.toastr.success('Profile background updated!', 'Success');
        this.isGradientModalOpen = false;
      },
      error: (err) => {
        console.error('Failed to update gradient:', err);
        this.toastr.error(
          err.error?.message || 'Failed to update background.',
          'Error'
        );
        this.isGradientModalOpen = false;
      },
    });
  }

  getGradientClass(): string {
    const gradient =
      typeof this.otherUser?.gradient === 'string' &&
      this.otherUser.gradient.trim() !== ''
        ? this.otherUser.gradient
        : 'from-indigo-600 to-purple-500';

    return `bg-gradient-to-l ${gradient}`;
  }
}
