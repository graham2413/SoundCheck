import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { User } from 'src/app/models/responses/user.response';
import { AuthService } from 'src/app/services/auth.service';
import { UserService } from 'src/app/services/user.service';

@Component({
  selector: 'app-user-profile',
  templateUrl: './user-profile.component.html',
  standalone: true,
  styleUrls: ['./user-profile.component.css'],
  imports: [CommonModule, FormsModule],
})
export class ProfileComponent implements OnInit {
  userProfile: User = {
    _id: '',
    username: '',
    gradient: '',
    createdAt: '',
    reviews: [],
    googleId: '',
    email: '',
    friends: [],
    profilePicture: '',
    artistList: [],
    friendInfo: {
      friends: [],
      friendRequestsReceived: [],
      friendRequestsSent: []
    }
  } as User;

  newPassword: string = '';
  confirmNewPassword: string = '';
  confirmPasswordError: string = '';
  showNewPassword: boolean = false;
  showConfirmPassword: boolean = false;
  showDeleteConfirm: boolean = false;
  selectedFile: File | null = null;
  passwordError: string = '';
  confirmEmail: string = '';
  profilePictureUrl: string = '';
  isTooltipOpen: boolean = false;

  isSaving: boolean = false;
  isDeleting: boolean = false;

  preferredApp: string | null = null;
availablePlatforms: string[] = [
  'spotify',
  'appleMusic',
  'youtubeMusic',
  'deezer',
  'amazonMusic',
  'soundcloud',
  'pandora',
  'audiomack',
];


platformStyles: Record<string, { label: string; color: string; icon?: string; imagePath?: string }> = {
  spotify: { label: 'Spotify', color: '#1DB954', icon: 'fab fa-spotify' },
  appleMusic: { label: 'Apple Music', color: '#FC3C44', icon: 'fab fa-apple' },
  youtubeMusic: { label: 'YouTube Music', color: '#FF0000', icon: 'fab fa-youtube' },
  amazonMusic: { label: 'Amazon Music', color: '#3B4CCA', icon: 'fab fa-amazon' },
  soundcloud: { label: 'SoundCloud', color: '#FF5500', icon: 'fab fa-soundcloud' },
  deezer: {
    label: 'Deezer',
    color: '#9333E8',
    imagePath: '../assets/deezer-logo.png'
  },
  audiomack: {
    label: 'Audiomack',
    color: '#FFBD00',
    imagePath: '../assets/audiomack-logo.png'
  },
  pandora: {
    label: 'Pandora',
    color: '#3668FF',
    imagePath: '../assets/pandora-logo.png'
  },
};

  constructor(
    private userService: UserService,
    private toastr: ToastrService,
    private router: Router,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.preferredApp = localStorage.getItem('preferredMusicApp');

    window.scrollTo({ top: 0, behavior: 'auto' });

    // Subscribe to the global profile state
    this.userService.userProfile$.subscribe((profile) => {
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
      this.profilePictureUrl =
        this.userProfile.profilePicture + '?t=' + Date.now();
    } else {
      this.profilePictureUrl = 'assets/user.png';
    }
  }

  setPreferredMusicApp(app: string) {
  this.preferredApp = app;
  localStorage.setItem('preferredMusicApp', app);
}

shadeColor(color: string, percent: number) {
  let R = parseInt(color.substring(1, 3), 16);
  let G = parseInt(color.substring(3, 5), 16);
  let B = parseInt(color.substring(5, 7), 16);

  R = Math.round((R * (100 + percent)) / 100);
  G = Math.round((G * (100 + percent)) / 100);
  B = Math.round((B * (100 + percent)) / 100);

  R = R < 255 ? R : 255;
  G = G < 255 ? G : 255;
  B = B < 255 ? B : 255;

  const RR = R.toString(16).padStart(2, '0');
  const GG = G.toString(16).padStart(2, '0');
  const BB = B.toString(16).padStart(2, '0');

  return `#${RR}${GG}${BB}`;
}

  logout() {
    this.authService.logout();
    this.toastr.success('Logged out successfully');
  }

onProfilePictureChange(event: Event): void {
  const input = event.target as HTMLInputElement;

  if (!input.files || input.files.length === 0) return;

  const file = input.files[0];
  this.selectedFile = file;

  const reader = new FileReader();
  reader.onload = (e: ProgressEvent<FileReader>) => {
    const base64 = e.target?.result as string;
    this.userProfile.profilePicture = base64;
    this.profilePictureUrl = base64;
  };
  reader.readAsDataURL(file);
}


  getTransformedImageUrl(fullUrl: string): string {
    if (!fullUrl) {
      return 'assets/otherUser.png'; // fallback
    }

    return fullUrl.replace(
      '/upload/',
      '/upload/w_1600,h_1600,c_fill,g_face,f_auto,q_auto,dpr_auto/'
    );
  }

  saveProfile() {
    this.passwordError = '';
    this.confirmPasswordError = '';
    this.isSaving = true;

    const formData = new FormData();
    formData.append('username', this.userProfile.username);

    if (this.selectedFile) {
      formData.append('profilePicture', this.selectedFile);
    }

    if (this.newPassword) {
      formData.append('newPassword', this.newPassword);
    }

    if (this.newPassword) {
      if (this.newPassword !== this.confirmNewPassword) {
        this.confirmPasswordError = 'Passwords do not match';
        this.isSaving = false;
        return;
      }
    }

    this.userService.updateUserProfile(formData).subscribe({
      next: (response) => {
        this.toastr.success('Profile updated!', 'Success');
        this.newPassword = '';
        this.confirmNewPassword = '';

        // Refresh user profile to show new image
        this.userService.setUserProfile({
          ...this.userProfile,
          email: response.email,
          profilePicture: response.profilePicture,
        });

        this.isSaving = false;
      },
      error: (err) => {
        this.isSaving = false;
        if (err.error && err.error.message) {
          this.toastr.error(err.error.message, 'Error')
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
          this.toastr.error('Failed to delete profile.', 'Error');
        },
      });
    }
  }

toggleTooltip() {
  this.isTooltipOpen = !this.isTooltipOpen;
}

closeTooltip() {
  this.isTooltipOpen = false;
}

  viewPublicProfile() {
    this.router.navigate([`/profile/${this.userProfile._id}`]);
  }
}
