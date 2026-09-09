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
        animate(
          '100ms ease-in',
          style({ opacity: 0, transform: 'scale(0.95)' })
        ),
      ]),
    ]),
    trigger('fadeSlide', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-20%)' }),
        animate(
          '250ms ease-out',
          style({ opacity: 1, transform: 'translateY(0)' })
        ),
      ]),
      transition(':leave', [
        animate(
          '200ms ease-in',
          style({ opacity: 0, transform: 'translateY(-10%)' })
        ),
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
      friendRequestsSent: [],
    },
  } as User;

  isProfileLoading: boolean = false;
  activeTab: string = 'home';

  isMobileNavShrunk: boolean = false;
  private lastScrollY: number = 0;
  // Tracks cumulative distance scrolled in the current unbroken downward
  // run (reset whenever the user scrolls up or is back near the top) - so
  // shrinking triggers off total distance traveled, not a single scroll
  // event's speed/delta. A slow, steady scroll now shrinks the nav just as
  // reliably as a fast flick once this distance is crossed.
  private downScrollStartY: number | null = null;
  private static readonly SHRINK_TRIGGER_DISTANCE_PX = 10;

  @HostListener('window:scroll')
  onWindowScroll(): void {
    const currentY = window.scrollY;
    const delta = currentY - this.lastScrollY;

    // Only force-expand at the true top (0) - the old 50px dead zone meant
    // starting a scroll from the very top needed to pass 50px PLUS the
    // trigger distance before anything happened, making it feel laggy
    // specifically from the top even though the rest of the page reacted
    // immediately once past that zone.
    if (currentY <= 0) {
      this.isMobileNavShrunk = false;
      this.downScrollStartY = null;
    } else if (delta > 0) {
      if (this.downScrollStartY == null) this.downScrollStartY = this.lastScrollY;
      if (currentY - this.downScrollStartY > NavbarComponent.SHRINK_TRIGGER_DISTANCE_PX) {
        this.isMobileNavShrunk = true;
      }
    } else if (delta < 0) {
      this.isMobileNavShrunk = false;
      this.downScrollStartY = null;
    }

    this.lastScrollY = currentY;
  }

  expandMobileNav(): void {
    this.isMobileNavShrunk = false;
  }

  getActiveMobileNavIndex(): number {
    const order = ['home', 'calendar', 'friends', 'profile'];
    return Math.max(order.indexOf(this.activeTab), 0);
  }

  constructor(
    private authService: AuthService,
    private toastr: ToastrService,
    private userService: UserService,
    private eRef: ElementRef,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.isProfileLoading = true;

    // Subscribe to profile updates
    this.userService.userProfile$.subscribe((profile) => {
      if (profile) {
        this.userProfile = profile;
        this.isProfileLoading = false;
        this.setTabFromPath(this.router.url); // re-evaluate now that we know our own id
      }
    });

    // Load profile if not already available
    if (!this.userProfile || !this.userProfile.username) {
      this.userService.getAuthenticatedUserProfile().subscribe({
        next: () => (this.isProfileLoading = false),
        error: () => (this.isProfileLoading = false),
      });
    }

    const currentPath = this.router.url;
    this.setTabFromPath(currentPath);

    // Subscribe to future navigation changes
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.setTabFromPath(event.urlAfterRedirects);
      });
  }

  // Helper function to avoid duplication
  private setTabFromPath(path: string) {
    // Own profile can be reached via either /profile or /profile/:ownUserId
    // (some links pass our own id explicitly) - only treat /profile/:id as
    // "someone else's profile" when the id isn't our own
    if (path === '/profile' || path === `/profile/${this.userProfile._id}`) this.activeTab = 'profile';
    else if (path.startsWith('/profile/')) this.activeTab = 'friends'; // viewing someone else's profile
    else if (path.startsWith('/friends')) this.activeTab = 'friends';
    else if (path.startsWith('/calendar')) this.activeTab = 'calendar';
    else this.activeTab = 'home';
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
