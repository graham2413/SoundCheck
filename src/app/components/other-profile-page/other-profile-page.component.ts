import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { UserService } from '../../services/user.service';
import { CommonModule } from '@angular/common';
import { ToastrService } from 'ngx-toastr';
import { Friend } from 'src/app/models/responses/friend-response';
import { animate, style, transition, trigger } from '@angular/animations';

@Component({
  selector: 'app-view-profile-page',
  imports: [CommonModule],
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

  constructor(private route: ActivatedRoute, private userService: UserService, private toastr: ToastrService, private router: Router) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.userId = params['userId'];
      this.user = null;
      this.fetchUserDetails();
    });
  }
  
  public fetchUserDetails(){
    this.userService.getOtherUserProfileInfo(this.userId).subscribe({
      next: (response) => {
       this.user = response;
      },
      error: () => {
        this.toastr.error(
         'Error retrieving User Profile',
          'Error'
        );
      },
    });
  }

  public goToFriendsPage (friend: Friend){
    this.router.navigate([`/profile/${friend._id}`]);
  }
}
