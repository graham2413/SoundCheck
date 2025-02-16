import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { LoginResponse } from 'src/app/models/responses/login-response';
import { AuthService } from 'src/app/services/auth.service';
import { UserService } from 'src/app/services/user.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class LoginComponent {
  email: string = '';
  password: string = '';
  errorMessages: { email?: string; password?: string; general?: string } = {};
  isLoading: boolean = false;

  constructor(private authService: AuthService, private router: Router, private toastr: ToastrService, private userService: UserService) {}

  validateInputs(): boolean {
    this.errorMessages = {};

    if (!this.email.trim()) {
      this.errorMessages.email = 'Email is required.';
    } else if (!/^\S+@\S+\.\S+$/.test(this.email)) {
      this.errorMessages.email = 'Enter a valid email address.';
    }
    if (!this.password.trim()) {
      this.errorMessages.password = 'Password is required.';
    }

    return Object.keys(this.errorMessages).length === 0;
  }

  onSubmit() {
    if (!this.validateInputs()) {
      return;
    }

    this.isLoading = true;

    const userData = { email: this.email, password: this.password };

    this.authService.login(userData).subscribe({
      next: (response: LoginResponse) => {
        localStorage.setItem('token', response.token);

        const profilePicture = response.user.profilePicture && response.user.profilePicture.trim() !== 'undefined'
        ? response.user.profilePicture
        : 'assets/user.png';

      localStorage.setItem('profilePicture', profilePicture);    
      this.userService.setUserProfile(response);    
      this.router.navigate(['/']);
      },
      error: (error) => {
        this.isLoading = false;
        this.toastr.error('Log in attempt failed.', 'Error');
        this.errorMessages.general = error.error.message || 'Invalid email or password.';
      },
      complete: () => {
        this.toastr.success('Logged in successfully!', 'Success');
        this.isLoading = false;
      }
    });
  }

  // loginWithGoogle() {
  //   this.authService.loginWithGoogle().subscribe({
  //     next: (response) => {
  //       localStorage.setItem('profilePicture', response.profilePicture || 'assets/user.png');
  //       this.router.navigate(['/']);
  //     },
  //     error: (error) => {
  //       console.error('Google login failed', error);
  //     }
  //   });
  // }
}
