import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from 'src/app/services/auth.service';

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css']
})
export class RegisterComponent {
  username: string = '';
  email: string = '';
  password: string = '';
  confirmPassword: string = '';
  errorMessages: { username?: string; email?: string; password?: string; confirmPassword?: string} = {};
  isLoading: boolean = false;

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
        this.toastr.success('Account created successfully!', 'Success');
        localStorage.setItem('token', response.token);
        this.router.navigate(['/login']);
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

  // loginWithGoogle() {
  //   this.authService.loginWithGoogle().subscribe({
  //     next: (response) => {
  //       if (response.isNewUser) {
  //         // Automatically register the user if it's their first time
  //         this.authService.registerWithGoogle(response.name, response.email, response.profilePicture).subscribe({
  //           next: () => {
  //             localStorage.setItem('profilePicture', response.profilePicture || 'assets/user.png');
  //             this.router.navigate(['/']);
  //           },
  //           error: (error) => {
  //             console.error('Google registration failed', error);
  //           }
  //         });
  //       } else {
  //         // If user already exists, just log them in
  //         localStorage.setItem('profilePicture', response.profilePicture || 'assets/user.png');
  //         this.router.navigate(['/']);
  //       }
  //     },
  //     error: (error) => {
  //       console.error('Google login failed', error);
  //     }
  //   });
  // }
}
