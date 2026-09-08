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
import { UpdateService } from './services/update.service';
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

  // Backed by UpdateService so the profile page's manual "Check for updates"
  // button shares the exact same detection state/logic as this automatic poll.
  get updateAvailable() { return this.updateService.updateAvailable; }
  get updateNotes() { return this.updateService.updateNotes; }
  get updateBuildNumber() { return this.updateService.updateBuildNumber; }
  isReloadingForUpdate = false; // triggers the loader's fade-out just before the hard reload fires
  updateProgressPercent = 0; // simulated (time-based) - activateUpdate() has no real byte-level progress
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
    private swUpdate: SwUpdate,
    private updateService: UpdateService
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
      } else if (window.location.pathname === '/dev-cinema-review') {
        // Dev-only preview route, intentionally unauthenticated - skip the
        // forced logout/redirect so it's viewable without logging in.
        this.profileLoaded = true;
      } else {
        console.warn('No token found in localStorage');
        this.logout(); // or route to login
      }
    }
  }

  // Checks for a new deployed version and blocks the app behind a full-screen
  // overlay until the user updates, rather than silently force-reloading (which
  // could interrupt someone mid-review) or letting them dismiss it indefinitely.
  //
  // Primary mechanism: directly poll the always-fresh, no-cache /version.json
  // and compare its buildNumber against CURRENT_BUILD_NUMBER (baked into this
  // running bundle at build time). This is deliberately NOT dependent on the
  // Angular Service Worker's own update-check lifecycle (checkForUpdate/
  // versionUpdates), which proved unreliable in practice - it only checks once
  // per app launch by default, and on mobile can silently go a long time
  // without ever firing VERSION_READY even though a newer build is already live.
  private initServiceWorkerUpdates(): void {
    this.updateService.checkForNewVersion().then(() => this.cdRef.markForCheck());

    const POLL_INTERVAL_MS = 5 * 60 * 1000;
    setInterval(() => this.updateService.checkForNewVersion().then(() => this.cdRef.markForCheck()), POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.updateService.checkForNewVersion().then(() => this.cdRef.markForCheck());
      }
    });

    // Secondary/best-effort: the SW's own event can still fire, sometimes faster.
    if (!this.swUpdate.isEnabled) return;
    this.swUpdate.versionUpdates
      .pipe(filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'))
      .subscribe(() => this.updateService.checkForNewVersion().then(() => this.cdRef.markForCheck()));
  }

  applyUpdate(): void {
    if (this.isApplyingUpdate) return;
    this.isApplyingUpdate = true;
    this.updateProgressPercent = 0;

    const FADE_MS = 200;
    const SNAP_HOLD_MS = 300; // brief pause at 100% before fading, so it doesn't feel instant
    const RAMP_CAP_MS = 1200; // ramp eases toward 97% over up to this long - if activateUpdate()
                              // takes longer, it just parks near-full and waits, which reads fine
    const rampStart = performance.now();
    let settled = false;

    const tickRamp = (now: number) => {
      if (settled) return;
      const t = Math.min((now - rampStart) / RAMP_CAP_MS, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out, feels like it's settling in rather than linear
      this.updateProgressPercent = Math.min(97, Math.round(eased * 97));
      if (t < 1) requestAnimationFrame(tickRamp);
    };
    requestAnimationFrame(tickRamp);

    const finish = () => {
      if (settled) return;
      settled = true;
      this.updateProgressPercent = 100;
      setTimeout(() => {
        this.isReloadingForUpdate = true;
        setTimeout(() => this.hardReload(), FADE_MS);
      }, SNAP_HOLD_MS);
    };

    if (!this.swUpdate.isEnabled) {
      // No real update to activate (dev preview) - give the ramp a moment to
      // play out first so it doesn't just flash straight to 100%
      setTimeout(finish, 1100);
      return;
    }

    // Guarantees the button always resolves to a reload, even if
    // activateUpdate() rejects or (worse) never settles at all
    this.swUpdate.activateUpdate().catch(() => {}).then(finish);
    setTimeout(finish, 5000);
  }

  // A plain reload() can still be intercepted by the outgoing (soon-to-be-gone)
  // service worker, which keeps controlling the page until it actually unloads -
  // unregister() alone doesn't guarantee that in-flight reload wins the race.
  // Navigating to a cache-busted URL sidesteps this: it's a URL the SW's exact-
  // match app-shell route has never seen, so it can't serve a cached response
  // for it even if it's technically still in control for a moment longer.
  private hardReload(): void {
    if (!navigator.serviceWorker) {
      document.location.reload();
      return;
    }
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => Promise.all(regs.map((reg) => reg.unregister())))
      .catch(() => {})
      .then(() => {
        const url = new URL(window.location.href);
        url.searchParams.set('_v', Date.now().toString());
        window.location.replace(url.toString());
      });
  }

  // Dev-only visual preview: ?previewUpdate=true shows the overlay with sample
  // data so the UI can be checked locally without a real deploy/SW update cycle.
  private previewUpdateOverlayIfRequested(): void {
    if (new URLSearchParams(window.location.search).get('previewUpdate') !== 'true') return;
    this.updateService.updateAvailable = true;
    this.updateService.updateBuildNumber = '42';
    this.updateService.updateNotes = {
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
