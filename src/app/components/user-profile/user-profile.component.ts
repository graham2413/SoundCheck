import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { User } from 'src/app/models/responses/user.response';
import { UserService } from 'src/app/services/user.service';

@Component({
  selector: 'app-user-profile',
  templateUrl: './user-profile.component.html',
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class ProfileComponent implements OnInit {
    userProfile: User = {
      _id: '',
      username: '',
      googleId: '',
      email: '',
      profilePicture: '',
      friendInfo: {
        friends: [],
        friendRequestsReceived: [],
        friendRequestsSent: []
      }
    } as User;

  newPassword: string = '';
  showDeleteConfirm: boolean = false;
  selectedFile: File | null = null;
  passwordError: string = '';
  confirmEmail: string = '';
  profilePictureUrl: string = '';
  
  isSaving: boolean = false;
  isDeleting: boolean = false;

  constructor(private userService: UserService, private toastr: ToastrService, private router: Router) {}

  ngOnInit(): void {
    // Subscribe to the global profile state
    this.userService.userProfile$.subscribe(profile => {
      if (profile) {
        this.userProfile = profile;
        this.updateProfilePictureUrl();
      }
    });

    // If the profile hasn't been fetched yet, fetch it once
    if (!this.userProfile || !this.userProfile.username) {
      this.userService.getAuthenticatedUserProfile().subscribe();
    }
  }
  
  updateProfilePictureUrl() {
    if (this.userProfile.profilePicture) {
        this.profilePictureUrl = this.userProfile.profilePicture + '?t=' + Date.now();
    } else {
        this.profilePictureUrl = 'assets/user.png';
    }
}
  
  onProfilePictureChange(event: any) {
    const file = event.target.files[0];

    if (file) {
      this.selectedFile = file;
      
      const reader = new FileReader();
      reader.onload = (e) => {
        this.userProfile.profilePicture = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  }

  saveProfile() {
    this.passwordError = '';
    this.isSaving = true;
  
    const formData = new FormData();
    formData.append('username', this.userProfile.username);
  
    if (this.selectedFile) {
      formData.append('profilePicture', this.selectedFile);
    }
  
    if (this.newPassword) {
      formData.append('newPassword', this.newPassword);
    }
  
    this.userService.updateUserProfile(formData).subscribe({
      next: (response) => {
        this.toastr.success('Profile updated!', 'Success');
        this.newPassword = '';
  
        // Refresh user profile to show new image
        this.userService.setUserProfile(response);
        this.isSaving = false;
      },
      error: (err) => {
        console.error('Error updating profile:', err);
        this.isSaving = false;
        if (err.error && err.error.message) {
          this.passwordError = err.error.message;
        }
      },
    });
  }
  

  confirmDeleteAccount() {
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
  }

  validateEmail() {
    this.confirmEmail = this.confirmEmail.trim();
  }

  deleteAccount() {
    if (this.confirmEmail === this.userProfile.email) {
      this.isDeleting = true;
      this.userService.deleteProfile().subscribe({
        next: (response) => {
          this.toastr.success('Profile Removed!', 'Success');
    
          localStorage.clear(); // Remove all user data
          this.router.navigate(['/login']);
        },
        error: (err) => {
          this.toastr.error("Failed to delete profile.", "Error");
        },
      })
    }
  }
}
