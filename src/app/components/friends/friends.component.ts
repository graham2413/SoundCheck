import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { User } from 'src/app/models/responses/user.response';
import { UserService } from 'src/app/services/user.service';

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

  userProfile: User = {
    _id: '',
    username: '',
    googleId: '',
    email: '',
    profilePicture: '',
    friendInfo: {
      friends: [],
      friendRequestsReceived: [],
      friendRequestsSent: []
    }
  } as User;
  
  constructor(
    private userService: UserService,
    private toastrService: ToastrService,
    private changeDetectorRef: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.getFriendData();
  }

  setActiveTab(tab: string) {
    this.activeTab = tab;
    this.searchQuery = '';

    setTimeout(() => {
      this.scrollToTop();
    }, 0);
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
          friend.username?.toLowerCase().includes(this.searchQuery?.toLowerCase() || '')
        )
      : [];
  }  

  getFriendData() {
    this.userService.userProfile$.subscribe((profile) => {
      if (profile) {
        this.userProfile = {
          ...profile,
          friendInfo: {
            friends: profile.friendInfo?.friends || [],
            friendRequestsReceived: profile.friendInfo?.friendRequestsReceived || [],
            friendRequestsSent: profile.friendInfo?.friendRequestsSent || []
          }
        };

        this.changeDetectorRef.detectChanges();
      }
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
            hasPendingRequestSent: this.userProfile?.friendInfo?.friendRequestsSent?.some(
              (request) => request._id === user._id
            ),
            hasPendingRequestReceived:
              this.userProfile?.friendInfo?.friendRequestsReceived?.some(
                (request) => request._id === user._id
              ),
          };
        });

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
    this.userService.sendFriendRequest(toUser._id).subscribe({
      next: (response) => {
        this.toastrService.success(response.message, 'Success');
        toUser.hasPendingRequestSent = true;

        this.userProfile!.friendInfo.friendRequestsSent = [
          ...(this.userProfile?.friendInfo?.friendRequestsSent || []),
          toUser,
        ];

        // update the global profile
        this.userService.setUserProfile(this.userProfile);
      },
      error: (error) => {
        this.toastrService.error('Error sending request', 'Error');
      },
    });
  }

  acceptFriendRequest(fromUser: User) {
    this.userService.acceptFriendRequest(fromUser._id).subscribe({
      next: (response) => {
        if (this.userProfile) {
          this.userProfile.friendInfo.friendRequestsReceived =
            this.userProfile.friendInfo.friendRequestsReceived?.filter(
              (r) => r._id !== fromUser._id
            ) || [];
        }
        this.userProfile?.friendInfo?.friends.push(fromUser);
        this.toastrService.success(response.message, 'Success');

        // update the global profile
        this.userService.setUserProfile(this.userProfile);
      },
      error: (error) => {
        this.toastrService.error(
          error.error?.message || 'Error sending request',
          'Error'
        );
      },
    });
  }

  declineFriendRequest(fromUser: User) {
    this.userService.declineFriendRequest(fromUser._id).subscribe({
      next: (response: any) => {
        if (this.userProfile && this.userProfile.friendInfo.friendRequestsReceived) {
          this.userProfile.friendInfo.friendRequestsReceived = this.userProfile.friendInfo.friendRequestsReceived.filter(
            (r) => r._id !== fromUser._id
          );
        }

        // update the global profile
        this.userService.setUserProfile(this.userProfile);
      },
      error: (error: any) => {
        this.toastrService.error(
          error.error?.message || 'Error removing request',
          'Error'
        );
      },
    });
  }

  removeFriend(friend: User) {
    this.userService.removeFriend(friend._id).subscribe({
      next: (response: any) => {
        if (this.userProfile && this.userProfile.friendInfo.friends) {
          this.userProfile.friendInfo.friends = this.userProfile.friendInfo.friends.filter(
            (friendItem) => friendItem._id !== friend._id
          );
        }        

        // update the global profile
        this.userService.setUserProfile(this.userProfile);
        this.toastrService.success('Removed friend', 'Success');
      },
      error: (error: any) => {
        this.toastrService.error(
          error.error?.message || 'Error removing friend',
          'Error'
        );
      },
    });
  }
}
