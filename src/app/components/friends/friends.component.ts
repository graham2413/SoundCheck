import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { User } from 'src/app/models/responses/user.response';
import { UserService } from 'src/app/services/user.service';

@Component({
  selector: 'app-following',
  templateUrl: './friends.component.html',
  styleUrls: ['./friends.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule]
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
  
  userProfile = {} as User;
  dummyFriends: User[] = [];

  constructor(private userService: UserService,
              private toastrService: ToastrService
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
      const y = targetElement.nativeElement.getBoundingClientRect().top + window.scrollY + yOffset;
  
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  }  

  getSearchPlaceholder() {
    switch (this.activeTab) {
      case 'addFriends': return 'Search users to add...';
      case 'myFriends': return 'Search your friends...';
      case 'friendRequests': return 'Search friend requests...';
      default: return 'Search...';
    }
  }

  filteredFriends() {
    return this.userProfile.friends.filter((friend) => friend.username.toLowerCase().includes(this.searchQuery.toLowerCase()));
  }


  getFriendData() {
    this.userService.userProfile$.subscribe(profile => {
      if (profile) {
        this.userProfile = profile;
        this.injectDummyFriends();
      }
    });
  }
  
  private injectDummyFriends() {
    if (!this.userProfile.friends) {
      this.userProfile.friends = [];
    }
  
    const currentFriendCount = this.userProfile.friends.length;
  
    if (currentFriendCount < 15) {
      const neededFriends = 15 - currentFriendCount;
  
      const dummyFriends: User[] = Array.from({ length: neededFriends }).map((_, i) => ({
        _id: `dummy_friend_${i + 1}`,
        username: `Friend ${i + 1}`,
        email: `friend${i + 1}@example.com`, // Fake email
        profilePicture: `https://via.placeholder.com/150?text=F${i + 1}`, // Placeholder image
        friends: [], // Assuming no nested friends for dummy data
        friendRequestsSent: [],
        friendRequestsReceived: [],
        isFriend: true, // Since they are friends
        hasPendingRequest: false, // No pending request
      }));
  
      this.userProfile.friends = [...this.userProfile.friends, ...dummyFriends];
      this.userProfile.friendRequestsReceived = [...this.userProfile.friendRequestsReceived, ...dummyFriends];
      this.dummyFriends = dummyFriends
    }
  }
  

  searchUsers(){
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
        this.usersToAdd = this.dummyFriends;
        // this.usersToAdd = users.map((user: User) => {
        //   return {
        //     ...user,
        //     isFriend: this.userProfile.friends.some(friend => friend._id === user._id),
        //     hasPendingRequest: this.userProfile.friendRequestsSent.some(request => request._id === user._id),
        //   };
        // });
        
      setTimeout(() => {
        this.addFriendsSearchLoading = false;
      }, 500);
      },
      error: (error) => {
        this.addFriendsSearchLoading = false;
        this.toastrService.error('Error occurred while searching users.', 'Error');
      }
    });

  }

  sendFriendRequest(user: User) {
    this.userService.sendFriendRequest(user._id).subscribe({
      next: (response) => {
        this.toastrService.success(response.message, 'Success');
          user.hasPendingRequest = true;

          this.userProfile.friendRequestsSent = [...this.userProfile.friendRequestsSent, user];

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
        this.userProfile.friendRequestsReceived = this.userProfile.friendRequestsReceived.filter(r => r._id !== fromUser._id);
        this.userProfile.friends.push(fromUser);
        this.toastrService.success(response.message, 'Success');

        // update the global profile
        this.userService.setUserProfile(this.userProfile);
      },
      error: (error) => {
        this.toastrService.error(error.error?.message || 'Error sending request', 'Error');
      },
    }); 
   }

  // Mock implementation of declining a friend request
  declineFriendRequest(user: User) {
    console.log(`Declining friend request from ${user.username}`);
    // Simulate API call
    setTimeout(() => {
      // this.userProfile.friendRequestsReceived = this.userProfile.friendRequestsReceived.filter(r => r.id !== user.id);
    }, 1000);
  }

  // Mock implementation of unfriending a user
  unfriend(user: User) {
    console.log(`Unfriending ${user.username}`);
    // Simulate API call
    setTimeout(() => {
    }, 1000);
  }

  viewProfile(user: User) {
  }
}
