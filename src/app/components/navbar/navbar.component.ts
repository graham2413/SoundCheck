import { Component, OnInit } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from 'src/app/services/auth.service';
import { UserService } from 'src/app/services/user.service';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
})
export class NavbarComponent implements OnInit {
  isMenuOpen: boolean = false;
  isProfileMenuOpen = false;
  profilePicture: string = '';
  userProfile: any = {};

  ngOnInit(): void {
    this.getProfilePicture();
  }

  constructor(private authService: AuthService, private toastr: ToastrService, private userService: UserService) {}

  toggleMenu() {
    this.isMenuOpen = !this.isMenuOpen;
  }

  toggleProfileMenu() {
    this.isProfileMenuOpen = !this.isProfileMenuOpen;
  }

  getProfilePicture() {
    this.userService.getAuthenticatedUserProfile().subscribe({
      next: (data) => {
        this.userProfile = data || {};
        if (!this.userProfile.profilePicture || this.userProfile.profilePicture.trim() === '') {
          this.userProfile.profilePicture = 'assets/user.png';
        } else {
          this.userProfile.profilePicture += `?t=${new Date().getTime()}`; // Prevent caching
        }
      },
      error: (err) => {
        console.error("Error fetching user profile:", err);
      }
    });
  }

  logout() {
    this.authService.logout();
    this.isMenuOpen = false;
    this.toastr.success('Logged out successfully');
  }

  isLoggedIn(): boolean {
    return this.authService.isLoggedIn();
  }
}
