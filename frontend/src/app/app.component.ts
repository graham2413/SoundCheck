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
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
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
          query(
            ':enter, :leave',
            style({ position: 'absolute', width: '100%' }),
            { optional: true }
          ),
          group([
            query(
              ':leave',
              [
                style({ transform: 'translateX(0)', opacity: 1 }),
                animate(
                  '300ms ease-in-out',
                  style({ transform: 'translateX(100%)', opacity: 0 })
                ),
              ],
              { optional: true }
            ),
            query(
              ':enter',
              [
                style({ transform: 'translateX(-100%)', opacity: 0 }),
                animate(
                  '300ms ease-in-out',
                  style({ transform: 'translateX(0)', opacity: 1 })
                ),
              ],
              { optional: true }
            ),
          ]),
        ]
      ),

      // Fallback: all other route changes fade
      transition('* <=> *', [
        query(
          ':enter',
          [
            style({ opacity: 0 }),
            animate('300ms ease-in-out', style({ opacity: 1 })),
          ],
          { optional: true }
        ),
      ]),
    ]),
  ],
})
export class AppComponent implements OnInit {
  title = 'Cinewave';
  currentUrl: string = '';
  navigationDirection: 'forward' | 'back' = 'forward';
  profileLoaded = false;
  activeOutlet: RouterOutlet | null = null;

  updateAvailable = false;
  updateNotes: Record<string, string[]> = {};
  updateBuildNumber = '';
  updateNoteIcons: Record<string, string> = {
    'New features': 'star',
    'Performance & stability': 'shield',
    'Security updates': 'lock',
  };
  isApplyingUpdate = false;

  constructor(
    private router: Router,
    private toastr: ToastrService,
    private authService: AuthService,
    private userService: UserService,
    private cdRef: ChangeDetectorRef,
    private swUpdate: SwUpdate
  ) {
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.currentUrl = event.urlAfterRedirects;
      });
  }

  ngOnInit() {
    this.initServiceWorkerUpdates();
    this.previewUpdateOverlayIfRequested();

    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
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
    } else {
      // No token in URL, maybe one exists already
      const tokenFromStorage = localStorage.getItem('token');
      if (tokenFromStorage) {
        this.handleToken(tokenFromStorage);
      } else {
        console.warn('No token found in localStorage');
        this.logout(); // or route to login
      }
    }
  }

  // Checks for a new deployed version and blocks the app behind a full-screen
  // overlay until the user updates, rather than silently force-reloading (which
  // could interrupt someone mid-review) or letting them dismiss it indefinitely.
  // Also polls periodically since the SW only auto-checks once per app launch by
  // default - important for a PWA that can stay open/backgrounded for a long time.
  private initServiceWorkerUpdates(): void {
    if (!this.swUpdate.isEnabled) return;

    this.swUpdate.versionUpdates
      .pipe(filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'))
      .subscribe(() => {
        this.updateAvailable = true;
        this.cdRef.markForCheck();

        fetch('/version.json', { cache: 'no-store' })
          .then((res) => res.json())
          .then((data) => {
            this.updateNotes = data?.notes || {};
            this.updateBuildNumber = data?.buildNumber || '';
            this.cdRef.markForCheck();
          })
          .catch(() => {});
      });

    const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
    setInterval(() => this.swUpdate.checkForUpdate(), SIX_HOURS_MS);
  }

  applyUpdate(): void {
    if (this.isApplyingUpdate) return;
    this.isApplyingUpdate = true;
    if (!this.swUpdate.isEnabled) {
      document.location.reload(); // dev preview mode - no real SW update to activate
      return;
    }
    this.swUpdate.activateUpdate().then(() => document.location.reload());
  }

  // Dev-only visual preview: ?previewUpdate=true shows the overlay with sample
  // data so the UI can be checked locally without a real deploy/SW update cycle.
  private previewUpdateOverlayIfRequested(): void {
    if (new URLSearchParams(window.location.search).get('previewUpdate') !== 'true') return;
    this.updateAvailable = true;
    this.updateBuildNumber = '42';
    this.updateNotes = {
      'New features': ['Track user lastLoggedIn timestamp, visible to admin on friends list'],
      'Performance & stability': ['Correct redis TTL handling on calendar cache'],
      'Security updates': ['Harden auth token validation on login'],
    };
  }

  private handleToken(token: string) {
    try {
      const decoded: DecodedToken = jwtDecode(token);

      const isNewUser = decoded.isNewUser === true;

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
          this.logout();
        }
      }, 8000); // 8s timeout

      forkJoin([delay$, profile$]).subscribe(([_, profile]) => {
        if (timeoutTriggered) return;
        clearTimeout(failsafe);

        if (!profile) {
          this.logout();
        } else {
          this.userService.setUserProfile(profile);
          this.profileLoaded = true;

          if (isNewUser) {
            this.toastr.success('Account created successfully!', 'Welcome');
          } else {
            // this.toastr.success('Welcome back!', 'Logged in');
          }

          this.cdRef.detectChanges();
        }
      });
    } catch (error: any) {
      console.warn('Token parsing failed:', error);
      this.logout();
    }
  }

  private logout() {
    console.warn('Logging out due to error or invalid/expired token');
    this.profileLoaded = true;
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  prepareRoute(outlet: RouterOutlet | null): string | null {
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

  setActiveOutlet(outlet: RouterOutlet) {
    this.activeOutlet = outlet;
  }
}
