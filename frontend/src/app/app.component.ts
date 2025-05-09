import { Component, OnInit } from '@angular/core';
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
import { filter } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { NavbarComponent } from './components/navbar/navbar.component';
import { ToastrService } from 'ngx-toastr';
import { SpotifyService } from './services/spotify.service';
import { jwtDecode } from 'jwt-decode';
import { AuthService } from './services/auth.service';
import { DecodedToken } from './models/responses/decoded-token-response';
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

  constructor(
    private router: Router,
    private toastr: ToastrService,
    private spotifyService: SpotifyService,
    private authService: AuthService
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
      // Delay resetting the direction to ensure animation picks up the correct one
      setTimeout(() => {
        this.navigationDirection = 'forward';
      }, 300);
    });

    this.fetchAndStoreAlbums();

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
      }
    } catch (error) {
      this.logout();
    }
  }

  private logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
    this.toastr.error('Session expired. Please log in again.', 'Error');
  }

  private fetchAndStoreAlbums(): void {
    this.spotifyService.getAlbumImages().subscribe({
      next: (data) => {
        localStorage.setItem('albumImages', JSON.stringify(data));
      },
      error: (err) => {
        console.error('Failed to fetch album images:', err);
      },
    });
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
