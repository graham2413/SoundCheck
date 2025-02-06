import { Component, OnInit } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from 'src/app/services/auth.service';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
})
export class NavbarComponent implements OnInit {
  isMenuOpen: boolean = false;
  isProfileMenuOpen = false;
  profilePicture: string = '';

  ngOnInit(): void {
    this.getProfilePicture();
  }

  constructor(private authService: AuthService, private toastr: ToastrService) {}

  toggleMenu() {
    this.isMenuOpen = !this.isMenuOpen;
  }

  toggleProfileMenu() {
    this.isProfileMenuOpen = !this.isProfileMenuOpen;
  }

  getProfilePicture() {
    const storedProfilePicture = localStorage.getItem('profilePicture');

    this.profilePicture = storedProfilePicture ? storedProfilePicture : 'assets/user.png';
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
