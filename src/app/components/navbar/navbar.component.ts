import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { User } from 'src/app/models/responses/user.response';
import { AuthService } from 'src/app/services/auth.service';
import { UserService } from 'src/app/services/user.service';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
})
export class NavbarComponent implements OnInit {
  isMenuOpen: boolean = false;
  isProfileMenuOpen: boolean = false;
  profilePicture: string = '';
  userProfile: User = {
    _id: '',
    username: '',
    email: '',
    profilePicture: '',
    friendInfo: {
      friends: [],
      friendRequestsReceived: [],
      friendRequestsSent: [],
    },
  } as User;

  constructor(
    private authService: AuthService,
    private toastr: ToastrService,
    private userService: UserService,
    private eRef: ElementRef
  ) {}

  ngOnInit(): void {
    this.userService.userProfile$.subscribe((profile) => {
      if (profile) {
        this.userProfile = profile;
      }
    });

    if (!this.userProfile || !this.userProfile.username) {
      this.userService.getAuthenticatedUserProfile().subscribe();
    }
  }

  toggleMenu() {
    this.isMenuOpen = !this.isMenuOpen;
  }

  toggleProfileMenu(event: Event) {
    event.stopPropagation();
    this.isProfileMenuOpen = !this.isProfileMenuOpen;
  }

  closeProfileMenu() {
    this.isProfileMenuOpen = false;
  }

  logout() {
    this.authService.logout();
    this.isMenuOpen = false;
    this.isProfileMenuOpen = false;
    this.toastr.success('Logged out successfully');
  }

  isLoggedIn(): boolean {
    return this.authService.isLoggedIn();
  }

  // Detects clicks outside the profile dropdown and closes it
  @HostListener('document:click', ['$event'])
  closeProfileMenuOnOutsideClick(event: Event) {
    if (!this.eRef.nativeElement.contains(event.target)) {
      this.isProfileMenuOpen = false;
    }
  }
}
