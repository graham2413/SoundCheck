import { Component } from '@angular/core';

@Component({
  selector: 'app-following',
  templateUrl: './friends.component.html',
  styleUrls: ['./friends.component.css'],
})
export class FriendsComponent {
  activeTab: string = 'myFriends';
  searchQuery: string = '';

  // Mock data for now (replace with actual API data)
  usersToAdd = [
    { id: '1', name: 'Alice', avatar: 'https://randomuser.me/api/portraits/women/1.jpg' },
    { id: '2', name: 'Bob', avatar: 'https://randomuser.me/api/portraits/men/2.jpg' }
  ];

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

  // Filtered lists for search functionality
  filteredUsersToAdd() {
    return this.usersToAdd.filter(user => user.name.toLowerCase().includes(this.searchQuery.toLowerCase()));
  }

  filteredFriends() {
    return this.myFriends.filter(friend => friend.name.toLowerCase().includes(this.searchQuery.toLowerCase()));
  }

  filteredFriendRequests() {
    return this.friendRequests.filter(request => request.name.toLowerCase().includes(this.searchQuery.toLowerCase()));
  }

  // Mock implementation of sending a friend request
  sendFriendRequest(user: any) {
    console.log(`Sending friend request to ${user.name}`);
    // Simulate API call
    setTimeout(() => {
      this.friendRequests.push(user);
      this.usersToAdd = this.usersToAdd.filter(u => u.id !== user.id);
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
