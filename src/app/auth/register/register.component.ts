import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/services/auth.service';

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css']
})
export class RegisterComponent {
  name: string = '';
  email: string = '';
  password: string = '';
  errorMessages: { name?: string; email?: string; password?: string } = {};
  isLoading: boolean = false;

  constructor(private authService: AuthService, private router: Router) {}

  validateInputs(): boolean {
    this.errorMessages = {};

    if (!this.name.trim()) {
      this.errorMessages.name = 'Name is required.';
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

    return Object.keys(this.errorMessages).length === 0;
  }

  onSubmit() {
    if (!this.validateInputs()) {
      return;
    }

    this.isLoading = true; // 🔥 Start loading

    const userData = { name: this.name, email: this.email, password: this.password };

    this.authService.register(userData).subscribe({
      next: (response) => {
        localStorage.setItem('token', response.token);
        this.router.navigate(['/login']);
      },
      error: (error) => {
        this.errorMessages.email = error.error.message || 'Registration failed.';
      },
      complete: () => {
        this.isLoading = false; // 🔥 Stop loading
      }
    });
  }
}
