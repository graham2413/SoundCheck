import { Routes } from '@angular/router';
import { LoginComponent } from './auth/login/login.component';
import { RegisterComponent } from './auth/register/register.component';
import { MainSearchComponent } from './components/main-search/main-search.component';
import { AuthGuard } from './guards/auth.guard';
import { ProfileComponent } from './components/profile/profile.component';
import { FriendsComponent } from './components/friends/friends.component';
import { ViewProfilePageComponent } from './components/view-profile-page/view-profile-page.component';

export const appRoutes: Routes = [
    { path: '', component: MainSearchComponent, canActivate: [AuthGuard], data: { animation: 'Home' } },
    { path: 'profile', component: ProfileComponent, canActivate: [AuthGuard], data: { animation: 'Profile' } },
    { path: 'friends', component: FriendsComponent, canActivate: [AuthGuard], data: { animation: 'Following' } },
    { path: 'profile/:userId', component: ViewProfilePageComponent, canActivate: [AuthGuard], data: { animation: 'ViewProfile' } },
    { path: 'login', component: LoginComponent, data: { animation: 'Login' } },
    { path: 'register', component: RegisterComponent, data: { animation: 'Register' } },
    { path: '**', redirectTo: '/' } // Redirect unknown routes
];
