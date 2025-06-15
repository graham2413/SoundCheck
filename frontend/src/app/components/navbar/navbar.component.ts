import { animate, style, transition, trigger } from '@angular/animations';
import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { filter } from 'rxjs';
import { User } from 'src/app/models/responses/user.response';
import { AuthService } from 'src/app/services/auth.service';
import { UserService } from 'src/app/services/user.service';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  animations: [
    trigger('fadeScale', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.95)' }),
        animate('150ms ease-out', style({ opacity: 1, transform: 'scale(1)' })),
      ]),
      transition(':leave', [
        animate('100ms ease-in', style({ opacity: 0, transform: 'scale(0.95)' })),
      ]),
    ]),
    trigger('fadeSlide', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-20%)' }),
        animate('250ms ease-out', style({ opacity: 1, transform: 'translateY(0)' })),
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0, transform: 'translateY(-10%)' }))
      ]),
    ]),
  ],
})
export class NavbarComponent implements OnInit {
  isMenuOpen: boolean = false;
  isProfileMenuOpen: boolean = false;
  profilePicture: string = '';
  userProfile: User = {
    _id: '',
    username: '',
    gradient: '',
    createdAt: '',
    reviews: [],
    googleId: '',
    email: '',
    friends: [],
    profilePicture: '',
    artistList: [],
    friendInfo: {
      friends: [],
      friendRequestsReceived: [],
      friendRequestsSent: []
    }
  } as User;

  isProfileLoading: boolean = false;
  activeTab: string = 'home';

  constructor(
    private authService: AuthService,
    private toastr: ToastrService,
    private userService: UserService,
    private eRef: ElementRef,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.isProfileLoading = true;
  
    // Subscribes to updates from the user profile observable
    this.userService.userProfile$.subscribe((profile) => {
      if (profile) {
        this.userProfile = profile;
        this.isProfileLoading = false;
      }
    });
  
    if (!this.userProfile || !this.userProfile.username) {
      this.userService.getAuthenticatedUserProfile().subscribe({
        next: () => this.isProfileLoading = false,
        error: () => this.isProfileLoading = false
      });
    }

    this.router.events
    .pipe(filter(event => event instanceof NavigationEnd))
    .subscribe((event: NavigationEnd) => {
      const path = event.urlAfterRedirects;
      if (path.startsWith('/profile')) this.activeTab = 'profile';
      else if (path.startsWith('/friends')) this.activeTab = 'friends';
      else this.activeTab = 'home';
    });
  }

  toggleMenu() {
    this.isMenuOpen = !this.isMenuOpen;

    if (this.isMenuOpen) {
      document.body.classList.add('no-scroll');
    } else {
      document.body.classList.remove('no-scroll');
    }
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

  setActiveTab(tab: string) {
    this.activeTab = tab;
  }

  // Detects clicks outside the profile dropdown and closes it
  @HostListener('document:click', ['$event'])
  closeProfileMenuOnOutsideClick(event: Event) {
    if (!this.eRef.nativeElement.contains(event.target)) {
      this.isProfileMenuOpen = false;
    }
  }

    getTransformedImageUrl(fullUrl: string): string {
    if (!fullUrl) {
      return 'assets/otherUser.png'; // fallback
    }

    return fullUrl.replace(
      '/upload/',
      '/upload/w_1600,h_1600,c_fill,g_face,f_auto,q_auto,dpr_auto/'
    );
  }
}
