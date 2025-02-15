import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { UserService } from 'src/app/services/user.service';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class ProfileComponent implements OnInit {
  userProfile: any = {};
  newPassword: string = '';
  showDeleteConfirm: boolean = false;
  selectedFile: File | null = null;
  passwordError: string = '';
  isSaving: boolean = false;

  constructor(private userService: UserService, private toastr: ToastrService) {}

  ngOnInit(): void {
    // Subscribe to the global profile state
    this.userService.userProfile$.subscribe(profile => {
      if (profile) {
        this.userProfile = profile;
      }
    });

    // If the profile hasn't been fetched yet, fetch it once
    if (!this.userProfile || !this.userProfile.username) {
      this.userService.getAuthenticatedUserProfile().subscribe();
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

  deleteAccount() {
    // add delete account logic here
  }
}
