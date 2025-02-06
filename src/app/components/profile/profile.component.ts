import { Component } from '@angular/core';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
})
export class ProfileComponent {
  profilePicture: string | ArrayBuffer | null = 'assets/user.png';
  displayName: string = 'John Doe';
  email: string = 'johndoe@example.com';
  newPassword: string = '';
  showDeleteConfirm: boolean = false;

  // Handle Profile Picture Change
  onProfilePictureChange(event: any) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        this.profilePicture = e.target?.result as string | ArrayBuffer | null;
      };
      reader.readAsDataURL(file);
    }
  }

  // Save Profile Changes
  saveProfile() {
    console.log('Profile Saved:', {
      displayName: this.displayName,
      email: this.email,
      newPassword: this.newPassword ? 'Updated' : 'Not Changed',
    });
    alert('Profile updated successfully!');
  }

  // Delete Account Confirmation
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
