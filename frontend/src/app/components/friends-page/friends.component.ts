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
import { NgbModal, NgbModalOptions } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { User } from 'src/app/models/responses/user.response';
import { UserService } from 'src/app/services/user.service';
import { ConfirmationModalComponent } from './confirmation-modal/confirmation-modal.component';

@Component({
  selector: 'app-friends',
  templateUrl: './friends.component.html',
  styleUrls: ['./friends.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
})
export class FriendsComponent implements OnInit {
  activeTab: string = 'myFriends';
  searchQuery: string = '';
  @ViewChild('searchBar') searchBar!: ElementRef<HTMLDivElement>;

  @ViewChild('friendsSection') friendsSection!: ElementRef;
  @ViewChild('addFriendsSection') addFriendsSection!: ElementRef;
  @ViewChild('friendRequestsSection') friendRequestsSection!: ElementRef;

  usersToAdd: User[] = [];
  addFriendsSearchInitiated = false;
  addFriendsSearchLoading = false;
  friendActionLoading = false;
  removingFriendId: string | null = null;
  retrievingFriendInfo = false;

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
    list: [],
    friendInfo: {
      friends: [],
      friendRequestsReceived: [],
      friendRequestsSent: []
    }
  } as User;

  declineLoadingMap: { [userId: string]: boolean } = {};
  acceptLoadingMap: { [userId: string]: boolean } = {};
  addFriendLoadingMap: { [userId: string]: boolean } = {};
  section: string | null = null;

  constructor(
    private userService: UserService,
    private toastrService: ToastrService,
    private changeDetectorRef: ChangeDetectorRef,
    private modal: NgbModal
  ) {}

  ngOnInit(): void {
    window.scrollTo({ top: 0, behavior: 'auto' });

    this.section = history.state.section || null;

    if (this.section) {
      this.setActiveTab(this.section);
    }

    this.getFriendData();
  }

  setActiveTab(tab: string) {
    this.activeTab = tab;
    this.searchQuery = '';

    setTimeout(() => {
      this.scrollToTop();
    }, 0);
    this.getFriendData();
  }

  scrollToTop() {
    let targetElement: ElementRef | undefined;

    if (this.activeTab === 'myFriends') {
      targetElement = this.friendsSection;
    } else if (this.activeTab === 'addFriends') {
      targetElement = this.addFriendsSection;
    } else if (this.activeTab === 'friendRequests') {
      targetElement = this.friendRequestsSection;
    }

    if (targetElement) {
      const yOffset = -140;
      const y =
        targetElement.nativeElement.getBoundingClientRect().top +
        window.scrollY +
        yOffset;

      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  }

  getSearchPlaceholder() {
    switch (this.activeTab) {
      case 'addFriends':
        return 'Search users to add...';
      case 'myFriends':
        return 'Search your friends...';
      case 'friendRequests':
        return 'Search friend requests...';
      default:
        return 'Search...';
    }
  }

  filteredFriends() {
    return this.userProfile?.friendInfo?.friends?.length
      ? this.userProfile.friendInfo.friends.filter((friend) =>
          friend.username
            ?.toLowerCase()
            .includes(this.searchQuery?.toLowerCase() || '')
        )
      : [];
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

        // this.userProfile = {
        //   _id: 'mock-user-id',
        //   username: 'Test User',
        //   email: 'test@example.com',
        //   profilePicture: 'https://i.pravatar.cc/150?img=99',
        //   googleId: 'google-mock-id',
        //   friendInfo: {
        //     friends: Array.from({ length: 10 }, (_, i) => ({
        //       _id: `friend-${i + 1}`,
        //       username: `Friend ${i + 1}`,
        //       email: `friend${i + 1}@test.com`,
        //       profilePicture: `https://i.pravatar.cc/150?img=${i + 1}`,
        //       googleId: `google-friend-${i + 1}`,
        //       friendInfo: {
        //         friends: [],
        //         friendRequestsReceived: [],
        //         friendRequestsSent: [],
        //       },
        //     })),
        //     friendRequestsReceived: Array.from({ length: 10 }, (_, i) => ({
        //       _id: `request-received-${i + 1}`,
        //       username: `Requester ${i + 1}`,
        //       email: `requester${i + 1}@test.com`,
        //       profilePicture: `https://i.pravatar.cc/150?img=${i + 20}`,
        //       googleId: `google-requester-${i + 1}`,
        //       friendInfo: {
        //         friends: [],
        //         friendRequestsReceived: [],
        //         friendRequestsSent: [],
        //       },
        //     })),
        //     friendRequestsSent: Array.from({ length: 10 }, (_, i) => ({
        //       _id: `request-sent-${i + 1}`,
        //       username: `Sent To ${i + 1}`,
        //       email: `sentto${i + 1}@test.com`,
        //       profilePicture: `https://i.pravatar.cc/150?img=${i + 40}`,
        //       googleId: `google-sentto-${i + 1}`,
        //       friendInfo: {
        //         friends: [],
        //         friendRequestsReceived: [],
        //         friendRequestsSent: [],
        //       },
        //     })),
        //   },
        // };
        setTimeout(() => {
          this.retrievingFriendInfo = false;
        }, 500);
        this.changeDetectorRef.detectChanges();
      },
    });
  }

  searchUsers() {
    if (!this.searchQuery.trim() || this.activeTab === 'myFriends') return;

    // Scroll the search bar into view
    setTimeout(() => {
      const searchBarEl = this.searchBar.nativeElement;
      const elementTop =
        searchBarEl.getBoundingClientRect().top + window.pageYOffset;
      const offset = elementTop - 110;
      window.scrollTo({ top: offset, behavior: 'smooth' });
    }, 0);

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

        const alreadyFriend = this.userProfile.friendInfo.friends.some(f => f._id === fromUser._id);
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
      next: (response: any) => {
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
      error: (error: any) => {
        this.declineLoadingMap[fromUser._id] = false;
        this.toastrService.error(
          error.error?.message || 'Error removing request',
          'Error'
        );
      },
    });
  }

  removeFriend(friend: User) {
    this.friendActionLoading = true;
    this.removingFriendId = friend._id;

    this.userService.removeFriend(friend._id).subscribe({
      next: (response: any) => {
        if (this.userProfile && this.userProfile.friendInfo.friends) {
          this.userProfile.friendInfo.friends =
            this.userProfile.friendInfo.friends.filter(
              (friendItem) => friendItem._id !== friend._id
            );
        }

        // Also clean up stale friend request entries
        if (this.userProfile.friendInfo.friendRequestsSent) {
          this.userProfile.friendInfo.friendRequestsSent =
            this.userProfile.friendInfo.friendRequestsSent.filter(
              (req) => req._id !== friend._id
            );
        }

        if (this.userProfile.friendInfo.friendRequestsReceived) {
          this.userProfile.friendInfo.friendRequestsReceived =
            this.userProfile.friendInfo.friendRequestsReceived.filter(
              (req) => req._id !== friend._id
            );
        }

        // update the global profile
        this.userService.setUserProfile(this.userProfile);
        this.friendActionLoading = false;
        this.removingFriendId = null;
        this.toastrService.success('Removed friend', 'Success');
      },
      error: (error: any) => {
        this.friendActionLoading = false;
        this.removingFriendId = null;
        this.toastrService.error(
          error.error?.message || 'Error removing friend',
          'Error'
        );
      },
    });
  }

  openModal(friend: any) {
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
}
