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

  constructor(private route: ActivatedRoute, private userService: UserService, private toastr: ToastrService, private router: Router,private modal: NgbModal) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.userId = params['userId'];
      this.user = null;
      window.scrollTo(0, 0);
      this.fetchUserDetails();
    });
  }
  
  public fetchUserDetails(){
    this.userService.getOtherUserProfileInfo(this.userId).subscribe({
      next: (response) => {
       this.user = response;
      //  this.user.friends = this.generateMockFriends(30);

       this.filteredFriends = [...this.user.friends];

      },
      error: () => {
        this.toastr.error(
         'Error retrieving User Profile',
          'Error'
        );
      },
    });
  }

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
