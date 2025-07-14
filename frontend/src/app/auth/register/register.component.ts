import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from 'src/app/services/auth.service';
import { environment } from 'src/environments/environments';

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule]
})
export class RegisterComponent {
  username: string = '';
  email: string = '';
  password: string = '';
  confirmPassword: string = '';
  errorMessages: { username?: string; email?: string; password?: string; confirmPassword?: string} = {};
  isLoading: boolean = false;
  isGoogleLoading: boolean = false;

  constructor(private authService: AuthService, private router: Router, private toastr: ToastrService) {}

  validateInputs(): boolean {
    this.errorMessages = {};

    if (!this.username.trim()) {
      this.errorMessages.username = 'Name is required.';
    }
    if (!this.email.trim()) {
      this.errorMessages.email = 'Email is required.';
    } else if (!/^\S+@\S+\.\S+$/.test(this.email)) {
      this.errorMessages.email = 'Enter a valid email address.';
    }
    if (!this.password.trim()) {
      this.errorMessages.password = 'Password is required.';
    } else if (this.password.length < 6) {
      this.errorMessages.password = 'Password must be at least 6 characters.';
    }

    if (this.password !== this.confirmPassword) {
      this.errorMessages.confirmPassword = "Passwords do not match!";
    }

    return Object.keys(this.errorMessages).length === 0;
  }

  onSubmit() {
    if (!this.validateInputs()) {
      return;
    }

    this.isLoading = true;

    const userData = { username: this.username, email: this.email, password: this.password };

    this.authService.register(userData).subscribe({
      next: (response) => {
        this.toastr.success('Account created successfully!', 'Welcome');
        localStorage.setItem('token', response.token);
        this.router.navigate(['/']);
      },
      error: (error) => {
        this.isLoading = false;
        this.toastr.error('Registration failed! Try again.', 'Error');
        this.errorMessages.email = error.error.message || 'Registration failed.';
      },
      complete: () => {
        this.isLoading = false;
      }
    });
  }

  loginWithGoogle() {
    this.isGoogleLoading = true;
    window.location.href = `${environment.backendUrl}/auth/google`;
  }  
  
}
