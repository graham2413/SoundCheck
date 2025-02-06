import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from 'src/app/services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {
  email: string = '';
  password: string = '';
  errorMessages: { email?: string; password?: string; general?: string } = {};
  isLoading: boolean = false;

  constructor(private authService: AuthService, private router: Router, private toastr: ToastrService) {}

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

    this.isLoading = true; // 🔥 Start loading

    const userData = { email: this.email, password: this.password };

    this.authService.login(userData).subscribe({
      next: (response) => {
        localStorage.setItem('token', response.token);

      const profilePicture = response.profilePicture && response.profilePicture !== 'undefined'
        ? response.profilePicture
        : 'assets/user.png';

      localStorage.setItem('profilePicture', profilePicture);        
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
