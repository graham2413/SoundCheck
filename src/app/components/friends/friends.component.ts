import { Component, ElementRef, ViewChild } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { User } from 'src/app/models/responses/user.response';
import { UserService } from 'src/app/services/user.service';

@Component({
  selector: 'app-following',
  templateUrl: './friends.component.html',
  styleUrls: ['./friends.component.css'],
})
export class FriendsComponent {
  activeTab: string = 'myFriends';
  searchQuery: string = '';
  @ViewChild('searchBar') searchBar!: ElementRef<HTMLDivElement>;
  
  
  usersToAdd: User[] = [];
  addFriendsSearchInitiated = false;
  addFriendsSearchLoading = false;
  
  constructor(private userService: UserService,
              private toastrService: ToastrService
  ) {}

  myFriends = [
    { id: '3', name: 'Charlie', avatar: 'https://randomuser.me/api/portraits/men/3.jpg' }
  ];

  friendRequests = [
    { id: '4', name: 'David', avatar: 'https://randomuser.me/api/portraits/men/4.jpg' }
  ];

  setActiveTab(tab: string) {
    this.activeTab = tab;
    this.searchQuery = '';
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
    return this.myFriends.filter(friend => friend.name.toLowerCase().includes(this.searchQuery.toLowerCase()));
  }

  filteredFriendRequests() {
    return this.friendRequests.filter(request => request.name.toLowerCase().includes(this.searchQuery.toLowerCase()));
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
      this.usersToAdd = users.filter((user: any) => {
        return !this.myFriends.some(friend => friend.id === user.id) &&
               !this.friendRequests.some(request => request.id === user.id);
      });
      this.addFriendsSearchLoading = false;
      },
      error: (error) => {
        this.addFriendsSearchLoading = false;
        this.toastrService.error('Error occurred while searching users.', 'Error');
      }
    });

  }

  // Mock implementation of sending a friend request
  sendFriendRequest(user: any) {
    console.log(`Sending friend request to ${user.name}`);
    // Simulate API call
    setTimeout(() => {
      this.friendRequests.push(user);
      this.usersToAdd = this.usersToAdd.filter(u => u._id !== user.id);
    }, 1000);
  }

  // Mock implementation of accepting a friend request
  acceptFriendRequest(user: any) {
    console.log(`Accepting friend request from ${user.name}`);
    // Simulate API call
    setTimeout(() => {
      this.myFriends.push(user);
      this.friendRequests = this.friendRequests.filter(r => r.id !== user.id);
    }, 1000);
  }

  // Mock implementation of declining a friend request
  declineFriendRequest(user: any) {
    console.log(`Declining friend request from ${user.name}`);
    // Simulate API call
    setTimeout(() => {
      this.friendRequests = this.friendRequests.filter(r => r.id !== user.id);
    }, 1000);
  }

  // Mock implementation of unfriending a user
  unfriend(user: any) {
    console.log(`Unfriending ${user.name}`);
    // Simulate API call
    setTimeout(() => {
      this.myFriends = this.myFriends.filter(f => f.id !== user.id);
    }, 1000);
  }

  viewProfile(user: any) {
  }
}
