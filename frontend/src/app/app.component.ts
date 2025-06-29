import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import {
  Router,
  NavigationEnd,
  RouterOutlet,
  RouterModule,
} from '@angular/router';
import {
  trigger,
  transition,
  style,
  animate,
  query,
  group,
} from '@angular/animations';
import { catchError, filter } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { NavbarComponent } from './components/navbar/navbar.component';
import { ToastrService } from 'ngx-toastr';
import { jwtDecode } from 'jwt-decode';
import { AuthService } from './services/auth.service';
import { DecodedToken } from './models/responses/decoded-token-response';
import { UserService } from './services/user.service';
import { forkJoin, of, timer } from 'rxjs';
@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  standalone: true,
  imports: [CommonModule, RouterModule, NavbarComponent],
  animations: [
    trigger('routeAnimations', [
      // Profile-to-profile via back button (slide current out to right)
      transition(
        (from: string | null, to: string | null) =>
          typeof from === 'string' &&
          typeof to === 'string' &&
          from.startsWith('viewProfilePage-') &&
          to.startsWith('viewProfilePage-back-'),
        [
          query(':enter, :leave', style({ position: 'absolute', width: '100%' }), { optional: true }),
          group([
            query(':leave', [
              style({ transform: 'translateX(0)', opacity: 1 }),
              animate('300ms ease-in-out', style({ transform: 'translateX(100%)', opacity: 0 }))
            ], { optional: true }),
            query(':enter', [
              style({ transform: 'translateX(-100%)', opacity: 0 }),
              animate('300ms ease-in-out', style({ transform: 'translateX(0)', opacity: 1 }))
            ], { optional: true })
          ])
        ]
      ),
    
      // Profile IN (forward navigation from another route or profile)
      transition(
        (from: string | null, to: string | null) =>
          typeof to === 'string' && to.startsWith('viewProfilePage-forward-'),
        [
          query(':enter, :leave', style({ position: 'absolute', width: '100%' }), { optional: true }),
          group([
            query(':leave', [
              style({ transform: 'translateX(0)', opacity: 1 }),
              animate('300ms ease-in-out', style({ transform: 'translateX(-100%)', opacity: 0 }))
            ], { optional: true }),
            query(':enter', [
              style({ transform: 'translateX(100%)', opacity: 0 }),
              animate('300ms ease-in-out', style({ transform: 'translateX(0)', opacity: 1 }))
            ], { optional: true })
          ])
        ]
      ),
    
      // Profile → any non-profile route
      transition(
        (from: string | null, to: string | null) =>
          typeof from === 'string' && from.startsWith('viewProfilePage-'),
        [
          query(':enter, :leave', style({ position: 'absolute', width: '100%' }), { optional: true }),
          group([
            query(':leave', [
              style({ transform: 'translateX(0)', opacity: 1 }),
              animate('300ms ease-in-out', style({ transform: 'translateX(100%)', opacity: 0 }))
            ], { optional: true }),
            query(':enter', [
              style({ transform: 'translateX(-100%)', opacity: 0 }),
              animate('300ms ease-in-out', style({ transform: 'translateX(0)', opacity: 1 }))
            ], { optional: true })
          ])
        ]
      ),
    
      // Fallback: all other route changes fade
      transition('* <=> *', [
        query(':enter', [
          style({ opacity: 0 }),
          animate('300ms ease-in-out', style({ opacity: 1 }))
        ], { optional: true })
      ])
    ])
     
  ],
})
export class AppComponent implements OnInit {
  title = 'SoundCheck';
  currentUrl: string = '';
  navigationDirection: 'forward' | 'back' = 'forward';
  profileLoaded = false;

  constructor(
    private router: Router,
    private toastr: ToastrService,
    private authService: AuthService,
    private userService: UserService,
    private cdRef: ChangeDetectorRef
  ) {
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.currentUrl = event.urlAfterRedirects;
      });
  }

  ngOnInit() {
    this.router.events
    .pipe(filter(event => event instanceof NavigationEnd))
    .subscribe(() => {
      setTimeout(() => {
        this.navigationDirection = 'forward';
      }, 300);
    });

    const queryParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = queryParams.get('token');

    if (tokenFromUrl) {
      localStorage.setItem('token', tokenFromUrl);
      this.handleToken(tokenFromUrl);

      // Clear URL params
      window.history.replaceState({}, document.title, window.location.pathname);
      this.router.navigate(['/']);
      this.toastr.success('Logged in successfully!', 'Success');
    } else {
      // No token in URL, maybe one exists already
      const tokenFromStorage = localStorage.getItem('token');
      if (tokenFromStorage) {
        this.handleToken(tokenFromStorage);
      }
      else {
        console.warn('No token found in localStorage');
        this.profileLoaded = true; // stop spinner so user sees UI
        this.logout(); // or route to login
}
    }
  }

private handleToken(token: string) {
  try {

    const decoded: DecodedToken = jwtDecode(token);

    if (!decoded?.userId || !decoded.exp) {
      throw new Error('Invalid token structure');
    }

    const currentTime = Math.floor(Date.now() / 1000);
    if (decoded.exp < currentTime) {
      this.logout();
      return;
    }

    const delay$ = timer(1500);
    const profile$ = this.userService.getAuthenticatedUserProfile().pipe(
      catchError((error) => {
        console.error('Failed to fetch user profile:', error);
        return of(null); // Let failsafe handle logout
      })
    );

    let timeoutTriggered = false;

    const failsafe = setTimeout(() => {
      if (!this.profileLoaded) {
        timeoutTriggered = true;
        console.warn('Failsafe triggered: profile not loaded in 10s');
        this.toastr.error('Profile loading timed out. Please try again.');
        this.profileLoaded = true;
        this.logout();
      }
    }, 10000); // 10s timeout

    forkJoin([delay$, profile$]).subscribe(([_, profile]) => {
      if (timeoutTriggered) return;
      clearTimeout(failsafe);

      if (!profile) {
        this.logout();
      } else {
        this.userService.setUserProfile(profile);
        this.profileLoaded = true;
        this.cdRef.detectChanges();
      }
    });

  } catch (error: any) {
    console.warn('Token parsing failed:', error);
    this.logout();
  }
}


  private logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
    this.toastr.error('Session expired. Please log in again.', 'Error');
  }


  prepareRoute(outlet: RouterOutlet) {
    if (!outlet || !outlet.isActivated) return null;

    const animation = outlet.activatedRouteData?.['animation'] ?? '';
    const userId = outlet.activatedRoute?.snapshot?.params?.['userId'];

    return animation === 'viewProfilePage' && userId
      ? `${animation}-${this.navigationDirection}-${userId}`
      : animation;
  }

  shouldShowNavbar(): boolean {
    const hiddenRoutes = [
      '/login',
      '/register',
      '/reset-password',
      '/forgot-password',
      '/not-found',
    ];
    return !hiddenRoutes.some((route) => this.currentUrl.startsWith(route));
  }
}
