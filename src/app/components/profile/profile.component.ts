import { Component, OnInit } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { UserService } from 'src/app/services/user.service';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
})
export class ProfileComponent implements OnInit {
  userProfile: any = {}; // Holds profile data
  newPassword: string = '';
  showDeleteConfirm: boolean = false;
  selectedImageBase64: string | null = null; // Stores the Base64 image
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
      const reader = new FileReader();
      reader.onload = (e) => {
        this.selectedImageBase64 = e.target?.result as string;
        this.userProfile.profilePicture = this.selectedImageBase64; // Update UI instantly
      };
      reader.readAsDataURL(file);
    }
  }

  saveProfile() {
    this.passwordError = '';
  
    const updatedData = {
      username: this.userProfile.username,
      profilePicture: this.selectedImageBase64 || this.userProfile.profilePicture,
      newPassword: this.newPassword ? this.newPassword : undefined,
    };
  
    this.userService.updateUserProfile(updatedData).subscribe({
      next: (response) => {
        this.toastr.success('Profile updated!', 'Success');
        this.newPassword = '';
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
    console.log('Account Deleted');
    alert('Your account has been deleted.');
    this.showDeleteConfirm = false;
  }
}
