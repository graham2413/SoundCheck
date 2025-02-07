import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './auth/login/login.component';
import { RegisterComponent } from './auth/register/register.component';
import { MainSearchComponent } from './components/main-search/main-search.component';
import { AuthGuard } from './guards/auth.guard';
import { ProfileComponent } from './components/profile/profile.component';

const routes: Routes = [
  { path: '', component: MainSearchComponent, canActivate: [AuthGuard], data: { animation: 'Home' } },
  { path: 'profile', component: ProfileComponent, canActivate: [AuthGuard], data: { animation: 'Profile' } },
  { path: 'login', component: LoginComponent, data: { animation: 'Login' } },
  { path: 'register', component: RegisterComponent, data: { animation: 'Register' } },
  { path: '**', redirectTo: '/' } // Redirect unknown routes to MainSearchComponent
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
