import { Component, OnInit } from '@angular/core';
import { Router, NavigationEnd, RouterOutlet, RouterModule } from '@angular/router';
import { trigger, transition, style, animate, query, group } from '@angular/animations';
import { filter } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { NavbarComponent } from './components/navbar/navbar.component';
import { ToastrService } from 'ngx-toastr';
import { UserService } from './services/user.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  standalone: true,
  imports: [CommonModule, RouterModule, NavbarComponent],
  animations: [
    trigger('routeAnimations', [
      transition('* <=> *', [
        query(':enter, :leave', style({ position: 'absolute', width: '100%', backfaceVisibility: 'hidden' }), { optional: true }),
        group([
          query(':leave', [
            animate('400ms ease-in-out', style({ transform: 'rotateY(180deg)', opacity: 0 }))
          ], { optional: true }),
          query(':enter', [
            style({ transform: 'rotateY(-180deg)', opacity: 0 }),
            animate('400ms ease-in-out', style({ transform: 'rotateY(0)', opacity: 1 }))
          ], { optional: true })
        ])
      ])
    ])
  ]
})
export class AppComponent implements OnInit {
  title = 'SoundCheck';
  currentUrl: string = '';

  constructor(private router: Router, private toastr: ToastrService, private userService: UserService) {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      this.currentUrl = event.urlAfterRedirects;
    });
  }

  ngOnInit() {
    const queryParams = new URLSearchParams(window.location.search);
    const token = queryParams.get('token');
    const user = queryParams.get('user');

    if (token) {
      localStorage.setItem('token', token);

      if (user) {
        // Decode and store the user profile
        const parsedUser = JSON.parse(decodeURIComponent(user));
        this.userService.setUserProfile(parsedUser);
      }

      // Clear URL params to prevent looping issues
      window.history.replaceState({}, document.title, window.location.pathname);

      // Redirect to home page
      this.router.navigate(['/']);
    }
  }

  prepareRoute(outlet: RouterOutlet) {
    return outlet && outlet.activatedRouteData ? outlet.activatedRouteData['animation'] : '';
  }

  shouldShowNavbar(): boolean {
    const hiddenRoutes = ['/login', '/register'];
    return !hiddenRoutes.includes(this.currentUrl);
  }
}
