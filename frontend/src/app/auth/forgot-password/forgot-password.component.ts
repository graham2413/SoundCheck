import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AuthService } from 'src/app/services/auth.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.component.html',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule]
})
export class ForgotPasswordComponent {
  email: string = '';
  message: string = '';
  error: string = '';
  isLoading: boolean = false;

  constructor(private authService: AuthService, private toastr: ToastrService) {}

  forgotPassword() {
    this.error = '';
    this.isLoading = true;
    this.authService.forgotPassword(this.email).subscribe({
      next: (res: any) => {
        this.toastr.success(res.message, "Success");
        this.isLoading = false;
        this.email = '';
      },
      error: (err) => {
        this.error = err.error.message || 'Error sending reset link.';
        this.isLoading = false;
      }
    });
  }
}
