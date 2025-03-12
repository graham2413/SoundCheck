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

export const appRoutes: Routes = [
    { path: '', component: MainSearchComponent, canActivate: [AuthGuard], data: { animation: 'Home' } },
    { path: 'profile', component: ProfileComponent, canActivate: [AuthGuard], data: { animation: 'Profile' } },
    { path: 'friends', component: FriendsComponent, canActivate: [AuthGuard], data: { animation: 'Friends' } },
    { path: 'profile/:userId', component: ViewProfilePageComponent, canActivate: [AuthGuard], data: { animation: 'ViewProfile' } },
    { path: 'login', component: LoginComponent, data: { animation: 'Login' } },
    { path: 'register', component: RegisterComponent, data: { animation: 'Register' } },
    { path: 'forgot-password', component: ForgotPasswordComponent, data: { animation: 'Register' } },
    { path: 'reset-password/:token', component: ResetPasswordComponent, data: { animation: 'Register' } },
    { path: 'not-found', component: NotFoundComponent,  data: { animation: 'Register'  }},
    { path: '**', redirectTo: 'not-found' }
];
