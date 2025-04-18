import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { UserService } from '../../services/user.service';
import { CommonModule } from '@angular/common';
import { ToastrService } from 'ngx-toastr';
import { Friend } from 'src/app/models/responses/friend-response';
import { animate, style, transition, trigger } from '@angular/animations';
import { FormsModule } from '@angular/forms';
import { NgbModal, NgbModalOptions } from '@ng-bootstrap/ng-bootstrap';
import { ReviewPageComponent } from '../review-page/review-page.component';
import { Album } from 'src/app/models/responses/album-response';
import { Artist } from 'src/app/models/responses/artist-response';
import { Song } from 'src/app/models/responses/song-response';
import { DisplayReview, Review } from 'src/app/models/responses/review-responses';
import { User } from 'src/app/models/responses/user.response';

@Component({
  selector: 'app-view-profile-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './other-profile-page.component.html',
  styleUrl: './other-profile-page.component.css',
  standalone: true,
  animations: [
    trigger('fadeSlide', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(10%)' }), 
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0, transform: 'translateY(-10%)' }))
      ])
    ])
  ]
})
export class ViewProfilePageComponent implements OnInit {
  userId!: string;
  user: any = null;
  searchQuery: string = '';
  filteredFriends: any[] = [];
  loggedInUser: User = {
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
  isLoadingFriendAction: boolean = false;

  constructor(private route: ActivatedRoute, private userService: UserService, private toastr: ToastrService, private router: Router,private modal: NgbModal) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.userId = params['userId'];
      this.user = null;
      window.scrollTo(0, 0);
  
      this.userService.userProfile$.subscribe(profile => {
        this.loggedInUser = profile;
  
        // Fetch only after loggedInUser is available
        if (this.loggedInUser) {
          this.fetchUserDetails();
        }
      });
    });
  }  
  
  public fetchUserDetails() {
    this.userService.getOtherUserProfileInfo(this.userId).subscribe({
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
  
        this.user = {
          ...response,
          isFriend,
          hasPendingRequestSent,
          hasPendingRequestReceived,
        };
  
        this.filteredFriends = [...this.user.friends];
  
        // Uncomment for mock data testing
        // this.user.friends = this.generateMockFriends(30);
        // this.user.reviews = this.generateMockReviews(10);
      },
      error: () => {
        this.toastr.error('Error retrieving User Profile', 'Error');
      },
    });
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
          googleId: '',
          friendInfo: {
            friends: [],
            friendRequestsSent: [],
            friendRequestsReceived: []
          }
        });
  
        this.userService.setUserProfile(this.loggedInUser);
      },
      error: (error) => {
        this.isLoadingFriendAction = false;
        this.toastr.error(error.error?.message || 'Error sending request', 'Error');
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
                profilePicture: fromUser.profilePicture,
                email: '',
                googleId: '',
                friendInfo: {
                  friends: [],
                  friendRequestsSent: [],
                  friendRequestsReceived: []
                }
              });
            }
          }
        
          if (this.user && this.user._id === fromUser._id) {
            this.user.isFriend = true;
            this.user.hasPendingRequestReceived = false;
            this.user.hasPendingRequestSent = false;
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

    removeFriend(friend: User) {
      this.isLoadingFriendAction = true;
    
      this.userService.removeFriend(friend._id).subscribe({
        next: (response: any) => {
          const { friendInfo } = this.loggedInUser;
    
          // Remove from friends
          friendInfo.friends = friendInfo.friends.filter(f => f._id !== friend._id);
    
          // Remove from sent/received requests just in case
          friendInfo.friendRequestsSent = friendInfo.friendRequestsSent.filter(r => r._id !== friend._id);
          friendInfo.friendRequestsReceived = friendInfo.friendRequestsReceived.filter(r => r._id !== friend._id);
    
          // Reflect in viewed profile
          if (this.user && this.user._id === friend._id) {
            this.user.isFriend = false;
            this.user.hasPendingRequestSent = false;
            this.user.hasPendingRequestReceived = false;
          }
    
          this.userService.setUserProfile(this.loggedInUser);
          this.toastr.success('Removed friend', 'Success');
          this.isLoadingFriendAction = false;
        },
        error: (error: any) => {
          this.toastr.error(error.error?.message || 'Error removing friend', 'Error');
          this.isLoadingFriendAction = false;
        },
      });
    }    

  // generateMockReviews(count: number): Review[] {
  //   const dummyTitles = ['Roses', 'Blinding Lights', 'Circles', 'Peaches', 'Levitating'];
  //   const dummyImages = Array(5).fill('https://via.placeholder.com/150');
  
  //   const reviews: DisplayReview[] = [];

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
  //         _id: this.user._id,
  //         username: this.user.username,
  //         email: this.user.email,
  //         friendInfo: this.user.friendInfo,
  //         googleId: this.user.googleId,
  //         profilePicture: this.user.profilePicture || 'default-profile.png'
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

  openReview(review: Album | Artist | Song) {
    const modalOptions: NgbModalOptions = {
      backdrop: false,
      keyboard: true,
      centered: true,
      scrollable: true,
    };
  
    const modalRef = this.modal.open(ReviewPageComponent, modalOptions);
  
    modalRef.componentInstance.record = review;
    modalRef.componentInstance.showForwardAndBackwardButtons = false;
  }
  
  
  filterFriends(): void {
    const query = this.searchQuery.toLowerCase().trim();
    this.filteredFriends = this.user.friends.filter((friend: { username: string; }) =>
      friend.username.toLowerCase().includes(query)
    );
  }

  public goToFriendsPage (friend: Friend){
    this.router.navigate([`/profile/${friend._id}`]);
  }
}
