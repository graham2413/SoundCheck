import { Routes } from '@angular/router';
import { LoginComponent } from './auth/login/login.component';
import { RegisterComponent } from './auth/register/register.component';
import { MainSearchComponent } from './components/main-search-page/main-search.component';
import { AuthGuard } from './guards/auth.guard';
import { ProfileComponent } from './components/user-profile-page/user-profile.component';
import { FriendsComponent } from './components/friends-page/friends.component';
import { ViewProfilePageComponent } from './components/other-profile-page/other-profile-page.component';
import { ResetPasswordComponent } from './auth/reset-password/reset-password.component';
import { ForgotPasswordComponent } from './auth/forgot-password/forgot-password.component';
import { NotFoundComponent } from './components/not-found.component/not-found-page.component';
import { CalendarPageComponent } from './components/calendar-page/calendar-page.component';
import { CinemaReviewPageDevPreviewComponent } from './components/cinema-review-page/cinema-review-page-dev-preview.component';

export const appRoutes: Routes = [
    { path: '', component: MainSearchComponent, canActivate: [AuthGuard], data: { animation: 'homePage' } },
    { path: 'profile', component: ProfileComponent, canActivate: [AuthGuard], data: { animation: 'profilePage' } },
    { path: 'friends', component: FriendsComponent, canActivate: [AuthGuard], data: { animation: 'friendsPage' } },
    { path: 'calendar', component: CalendarPageComponent, canActivate: [AuthGuard], data: { animation: 'calendarPage' } },
    { path: 'profile/:userId', component: ViewProfilePageComponent, canActivate: [AuthGuard], data: { animation: 'viewProfilePage' } },

    // Dev-only preview of the in-progress cinema review page redesign, no auth guard
    // so it's quick to iterate on - remove once the real page replaces the modal.
    { path: 'dev-cinema-review', component: CinemaReviewPageDevPreviewComponent },
  
    // Auth-related
    { path: 'login', component: LoginComponent, data: { animation: 'loginPage' } },
    { path: 'register', component: RegisterComponent, data: { animation: 'registerPage' } },
    { path: 'forgot-password', component: ForgotPasswordComponent, data: { animation: 'forgotPasswordPage' } },
    { path: 'reset-password/:token', component: ResetPasswordComponent, data: { animation: 'resetPasswordPage' } },
  
    // Not found
    { path: 'not-found', component: NotFoundComponent, data: { animation: 'notFoundPage' } },
    { path: '**', redirectTo: 'not-found' }
  ];