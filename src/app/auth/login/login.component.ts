import { Component } from '@angular/core';
import { Router } from '@angular/router';
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
  isLoading: boolean = false; // 🔥 Loading state

  constructor(private authService: AuthService, private router: Router) {}

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
        this.router.navigate(['/']);
      },
      error: (error) => {
        this.errorMessages.general = error.error.message || 'Invalid email or password.';
      },
      complete: () => {
        this.isLoading = false; // 🔥 Stop loading
      }
    });
  }
}
