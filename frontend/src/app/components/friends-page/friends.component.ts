import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnInit,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { User } from 'src/app/models/responses/user.response';
import { UserService } from 'src/app/services/user.service';
import { TimeAgoPipe } from 'src/app/shared/timeAgo/time-ago.pipe';
import { animate, animateChild, query, stagger, style, transition, trigger } from '@angular/animations';

@Component({
  selector: 'app-friends',
  templateUrl: './friends.component.html',
  styleUrls: ['./friends.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TimeAgoPipe],
    animations: [
      trigger('fadeSlideIn', [
        // Animate the container
        transition(':enter', [
          query('@itemAnim', [
            stagger(50, animateChild())
          ], { optional: true })
        ])
      ]),
  
      // This handles each individual item
      trigger('itemAnim', [
        transition(':enter', [
          style({ opacity: 0, transform: 'translateX(-20px)' }), // swipe in from left
          animate('300ms ease-out', style({ opacity: 1, transform: 'translateX(0)' }))
        ]),
        transition(':leave', [
          animate('200ms ease-in', style({ opacity: 0, transform: 'translateX(20px)' })) // swipe out to right
        ])
      ])
    ]
})
export class FriendsComponent implements OnInit {
  searchQuery: string = '';
  lastSearchedQuery: string = '';
  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;

  usersToAdd: User[] = [];
  addFriendsSearchInitiated = false;
  addFriendsSearchLoading = false;
  retrievingFriendInfo = false;

  // "Find Friends" page state.
  suggestedUsers: User[] = [];
  suggestedUsersLoading = false;
  showFriendRequestsOverlay = false;

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

  declineLoadingMap: { [userId: string]: boolean } = {};
  acceptLoadingMap: { [userId: string]: boolean } = {};
  addFriendLoadingMap: { [userId: string]: boolean } = {};
  imageLoadState: { [key: string]: boolean } = {};

  constructor(
    private userService: UserService,
    private toastrService: ToastrService,
    private changeDetectorRef: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    window.scrollTo({ top: 0, behavior: 'auto' });

    this.getFriendData();
    this.loadSuggestedUsers();
  }

  // "Suggested for You" - a few random users (excluding existing friends/
  // pending requests, handled server-side) to seed the new Find Friends
  // page. Flags mapped the same way searchUsers() maps usersToAdd, so the
  // Add button below can reuse the exact same state/logic.
  loadSuggestedUsers(): void {
    this.suggestedUsersLoading = true;
    this.userService.getSuggestedUsers().subscribe({
      next: (users: User[]) => {
        this.suggestedUsers = users.map((user: User) => ({
          ...user,
          isFriend: this.userProfile?.friendInfo?.friends?.some((friend) => friend._id === user._id),
          hasPendingRequestSent: this.userProfile?.friendInfo?.friendRequestsSent?.some((request) => request._id === user._id),
          hasPendingRequestReceived: this.userProfile?.friendInfo?.friendRequestsReceived?.some((request) => request._id === user._id),
        }));
        this.suggestedUsersLoading = false;
      },
      error: () => {
        this.suggestedUsersLoading = false;
      },
    });
  }

  markImageLoaded(i: number, context: string): void {
    this.imageLoadState[`${i}-${context}`] = true;
  }

  isImageLoaded(i: number, context: string): boolean {
    return this.imageLoadState[`${i}-${context}`] === true;
  }

  getTransformedImageUrl(fullUrl: string): string {
    if (!fullUrl) {
      return 'assets/user.png';
    }

    return fullUrl.replace(
      '/upload/',
      '/upload/w_1600,h_1600,c_fill,g_face,f_auto,q_auto,dpr_auto/'
    );
  }

  clearSearchQuery(): void {
    this.searchQuery = '';
    this.lastSearchedQuery = '';
    this.addFriendsSearchInitiated = false;
    this.usersToAdd = [];
    // Deferred - the "x" button click would otherwise steal focus back to
    // itself right after this runs, since it's still mid-click when called.
    setTimeout(() => this.searchInput?.nativeElement.focus());
  }

  getFriendData() {
    this.retrievingFriendInfo = true;

    this.userService.getAuthenticatedUserProfile().subscribe({
      next: (freshProfile) => {
        this.userService.setUserProfile(freshProfile); // Push fresh profile into BehaviorSubject

        // Also update local state if you still want to keep this.userProfile for filtering
        this.userProfile = {
          ...freshProfile,
          friendInfo: {
            friends: freshProfile.friendInfo?.friends || [],
            friendRequestsReceived:
              freshProfile.friendInfo?.friendRequestsReceived || [],
            friendRequestsSent:
              freshProfile.friendInfo?.friendRequestsSent || [],
          },
        };

        setTimeout(() => {
          this.retrievingFriendInfo = false;
        }, 500);
        this.changeDetectorRef.detectChanges();
      },
    });
  }

  searchUsers() {
    if (!this.searchQuery.trim()) return;

    this.lastSearchedQuery = this.searchQuery.trim();
    this.addFriendsSearchLoading = true;
    this.addFriendsSearchInitiated = true;

    this.userService.searchUsers(this.searchQuery).subscribe({
      next: (users: User[]) => {
        this.usersToAdd = users.map((user: User) => {
          return {
            ...user,
            isFriend: this.userProfile?.friendInfo?.friends?.some(
              (friend) => friend._id === user._id
            ),
            hasPendingRequestSent:
              this.userProfile?.friendInfo?.friendRequestsSent?.some(
                (request) => request._id === user._id
              ),
            hasPendingRequestReceived:
              this.userProfile?.friendInfo?.friendRequestsReceived?.some(
                (request) => request._id === user._id
              ),
          };
        });
        //  this.usersToAdd = Array.from({ length: 10 }, (_, i) => ({
        //     _id: `user-${i + 1}`,
        //     username: `User ${i + 1}`,
        //     email: `user${i + 1}@test.com`,
        //     profilePicture: `https://i.pravatar.cc/150?img=${i + 1}`,
        //     googleId: `google-user-${i + 1}`,
        //     friendInfo: {
        //       friends: [],
        //       friendRequestsReceived: [],
        //       friendRequestsSent: [],
        //     },
        //   }));

        setTimeout(() => {
          this.addFriendsSearchLoading = false;
        }, 500);
      },
      error: (error) => {
        this.addFriendsSearchLoading = false;
        this.toastrService.error(
          'Error occurred while searching users.',
          'Error'
        );
      },
    });
  }
  sendFriendRequest(toUser: User) {
    this.addFriendLoadingMap[toUser._id] = true;
    this.userService.sendFriendRequest(toUser._id).subscribe({
      next: (response) => {
        this.toastrService.success(response.message, 'Success');
        toUser.hasPendingRequestSent = true;

        this.userProfile!.friendInfo.friendRequestsSent = [
          ...(this.userProfile?.friendInfo?.friendRequestsSent || []),
          toUser,
        ];
        this.addFriendLoadingMap[toUser._id] = false;

        // update the global profile
        this.userService.setUserProfile(this.userProfile);
      },
      error: (error) => {
        this.addFriendLoadingMap[toUser._id] = false;
        this.toastrService.error('Error sending request', 'Error');
      },
    });
  }

  acceptFriendRequest(fromUser: User) {
    this.acceptLoadingMap[fromUser._id] = true;
    this.userService.acceptFriendRequest(fromUser._id).subscribe({
      next: (response) => {
        if (this.userProfile) {
          this.userProfile.friendInfo.friendRequestsReceived =
            this.userProfile.friendInfo.friendRequestsReceived?.filter(
              (r) => r._id !== fromUser._id
            ) || [];
        }

        const alreadyFriend = this.userProfile.friendInfo.friends.some(
          (f) => f._id === fromUser._id
        );
        if (!alreadyFriend) {
          this.userProfile.friendInfo.friends.push(fromUser);
        }
        this.acceptLoadingMap[fromUser._id] = false;
        this.toastrService.success(response.message, 'Success');

        // update the global profile
        this.userService.setUserProfile(this.userProfile);
      },
      error: (error) => {
        this.acceptLoadingMap[fromUser._id] = false;
        this.toastrService.error(
          error.error?.message || 'Error sending request',
          'Error'
        );
      },
    });
  }

  declineFriendRequest(fromUser: User) {
    this.declineLoadingMap[fromUser._id] = true;

    this.userService.declineFriendRequest(fromUser._id).subscribe({
      next: (_: unknown) => {
        if (
          this.userProfile &&
          this.userProfile.friendInfo.friendRequestsReceived
        ) {
          this.userProfile.friendInfo.friendRequestsReceived =
            this.userProfile.friendInfo.friendRequestsReceived.filter(
              (r) => r._id !== fromUser._id
            );
        }

        // update the global profile
        this.userService.setUserProfile(this.userProfile);
        this.declineLoadingMap[fromUser._id] = false;
        this.toastrService.success('Friend request declined', 'Success');
      },
      error: (error: { error?: { message?: string } }) => {
        this.declineLoadingMap[fromUser._id] = false;
        this.toastrService.error(
          error.error?.message || 'Error removing request',
          'Error'
        );
      },
    });
  }
}
