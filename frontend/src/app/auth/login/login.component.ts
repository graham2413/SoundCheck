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
  showPassword: boolean = false;

  // Decaying-wave envelope so the soundwave bars read as an intentional
  // waveform (tapering + rippling outward) rather than random noise - the
  // ramp-up keeps the first few bars near-flat so they look like a
  // continuation of the thin line inside the logo, not a sudden jump
  waveformBars: { height: number; opacity: number }[] = Array.from({ length: 36 }, (_, i) => {
    const d = i / 36;
    const rampUp = Math.min(1, d / 0.12);
    const decay = Math.pow(1 - d, 0.6);
    const wave = 0.35 + 0.65 * Math.abs(Math.sin(d * Math.PI * 3.2));
    return { height: Math.max(2, rampUp * wave * decay * 56), opacity: Math.max(0.08, decay) };
  });

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
        this.toastr.error(`Log in attempt failed:  ${error.error?.message}.`, 'Error');
        this.errorMessages.general = error.error.message || 'Invalid email or password.';
      }
    });
  }

  loginWithGoogle() {
    this.isGoogleLoading = true;
    window.location.href = `${environment.backendUrl}/auth/google`;
  }  
  
}
