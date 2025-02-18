import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { LoginResponse } from 'src/app/models/responses/login-response';
import { AuthService } from 'src/app/services/auth.service';
import { UserService } from 'src/app/services/user.service';
import { environment } from 'src/environments/environments';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule]
})
export class LoginComponent {
  email: string = '';
  password: string = '';
  errorMessages: { email?: string; password?: string; general?: string } = {};
  isLoading: boolean = false;
  isGoogleLoading = false;

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

      this.userService.setUserProfile(response.user);   
      this.router.navigate(['/']);
      this.toastr.success('Logged in successfully!', 'Success');
      this.isLoading = false;
      },
      error: (error) => {
        this.isLoading = false;
        this.toastr.error('Log in attempt failed.', 'Error');
        this.errorMessages.general = error.error.message || 'Invalid email or password.';
      }
    });
  }

  loginWithGoogle() {
    this.isGoogleLoading = true;
    window.location.href = `${environment.backendUrl}/auth/google`;
  }  
  
}
