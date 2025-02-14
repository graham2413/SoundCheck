import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { RegisterComponent } from './auth/register/register.component';
import { LoginComponent } from './auth/login/login.component';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AuthService } from './services/auth.service';
import { provideHttpClient } from '@angular/common/http';
import { MainSearchComponent } from './components/main-search/main-search.component';
import { NavbarComponent } from './components/navbar/navbar.component';
import { SearchService } from './services/search.service';
import { ProfileComponent } from './components/profile/profile.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations'; // Required for animations
import { ToastrModule } from 'ngx-toastr';
import { ReviewPageComponent } from './components/review-page/review-page.component';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { AudioPlayerComponent } from './components/audio-player/audio-player.component';

@NgModule({
  declarations: [
    AppComponent,
    LoginComponent,
    RegisterComponent,
    MainSearchComponent,
    NavbarComponent,
    ProfileComponent,
    ReviewPageComponent,
    AudioPlayerComponent
  ],
  imports: [
    BrowserModule,
    NgbModule,
    AppRoutingModule,
    FormsModule,
    RouterModule,
    BrowserAnimationsModule,
    ToastrModule.forRoot({
      timeOut: 3000, // Auto dismiss after 3 seconds
      positionClass: 'toast-bottom-center', // Position of the toast
      preventDuplicates: true, // Prevent multiple toasts of the same type
      progressBar: true // Shows progress bar for timeout
    }),
  ],
  providers: [
    AuthService,
    SearchService,
    provideHttpClient()
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
