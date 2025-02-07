import { Component, OnInit } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { UserService } from 'src/app/services/user.service';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
})
export class ProfileComponent implements OnInit {
  userProfile: any = {};
  newPassword: string = '';
  showDeleteConfirm: boolean = false;
  selectedFile: File | null = null;  // Store file instead of Base64
  passwordError: string = '';

  constructor(private userService: UserService, private toastr: ToastrService) {}

  ngOnInit(): void {
    this.getProfileData();
  }

  getProfileData() {
    this.userService.getAuthenticatedUserProfile().subscribe({
      next: (data) => {
        this.userProfile = data || {};
        if (!this.userProfile.profilePicture || this.userProfile.profilePicture.trim() === '') {
          this.userProfile.profilePicture = 'assets/user.png';
        } else {
          this.userProfile.profilePicture += `?t=${new Date().getTime()}`; // Prevent caching
        }
      },
      error: (err) => {
        console.error("Error fetching user profile:", err);
      }
    });
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
        this.getProfileData();
      },
      error: (err) => {
        console.error('Error updating profile:', err);
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

  deleteAccount() {
    // add delete account logic here
  }
}
