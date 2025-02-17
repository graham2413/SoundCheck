import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { UserService } from '../../services/user.service';
import { CommonModule } from '@angular/common';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-view-profile-page',
  imports: [CommonModule],
  templateUrl: './view-profile-page.component.html',
  styleUrl: './view-profile-page.component.css',
  standalone: true
})
export class ViewProfilePageComponent implements OnInit {
  userId!: string;
  user: any = null;

  constructor(private route: ActivatedRoute, private userService: UserService, private toastr: ToastrService) {}

  ngOnInit(): void {
    this.userId = this.route.snapshot.paramMap.get('userId')!;

    // Fetch user details
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
}
