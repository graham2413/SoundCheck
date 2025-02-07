import { Component, ElementRef, HostListener, OnInit } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from 'src/app/services/auth.service';
import { UserService } from 'src/app/services/user.service';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
})
export class NavbarComponent implements OnInit {
  isMenuOpen: boolean = false;
  isProfileMenuOpen: boolean = false;
  profilePicture: string = '';
  userProfile: any = {};

  constructor(
    private authService: AuthService,
    private toastr: ToastrService,
    private userService: UserService,
    private eRef: ElementRef
  ) {}

  ngOnInit(): void {
    this.userService.userProfile$.subscribe(profile => {
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
