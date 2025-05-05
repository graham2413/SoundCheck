import { Component, OnInit } from '@angular/core';
import { Router, NavigationEnd, RouterOutlet, RouterModule } from '@angular/router';
import { trigger, transition, style, animate, query, group } from '@angular/animations';
import { filter } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { NavbarComponent } from './components/navbar/navbar.component';
import { ToastrService } from 'ngx-toastr';
import { UserService } from './services/user.service';
import { SpotifyService } from './services/spotify.service';
import { jwtDecode } from 'jwt-decode';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  standalone: true,
  imports: [CommonModule, RouterModule, NavbarComponent],
  animations: [
    trigger('routeAnimations', [
  
      // Any route -> ViewProfile (slide in from right)
      transition('* => viewProfilePage', [
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
      ]),
  
      // ViewProfile -> any route (slide out to right)
      transition('viewProfilePage => *', [
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
      ]),
  
      // Fallback: fade for all other transitions
      transition('* <=> *', [
        query(':enter', [
          style({ opacity: 0 }),
          animate('200ms ease-in-out', style({ opacity: 1 }))
        ], { optional: true })
      ])
    ])
  ]
  
})
export class AppComponent implements OnInit {
  title = 'Sound Check';
  currentUrl: string = '';

  constructor(private router: Router, 
              private toastr: ToastrService, 
              private userService: UserService, 
              private spotifyService: SpotifyService, 
              private authService: AuthService) {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      this.currentUrl = event.urlAfterRedirects;
    });
  }

  ngOnInit() {
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
      const decoded: any = jwtDecode(token);
  
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
    return outlet?.activatedRouteData?.['animation'] ?? '';
  }  

  shouldShowNavbar(): boolean {
    const hiddenRoutes = ['/login', '/register', '/reset-password', "/forgot-password", "/not-found"];
    return !hiddenRoutes.some(route => this.currentUrl.startsWith(route));
  }
}
