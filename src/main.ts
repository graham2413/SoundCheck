import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideToastr } from 'ngx-toastr';
import { provideAnimations } from '@angular/platform-browser/animations'; // ✅ Required for route animations


// Import services
import { AuthService } from './app/services/auth.service';
import { SearchService } from './app/services/search.service';
import { appRoutes } from './app/app-routing.module';

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept();
}

bootstrapApplication(AppComponent, {
  providers: [
    provideHttpClient(),
    provideRouter(appRoutes),
    provideAnimations(),
    provideToastr(),
    AuthService,
    SearchService
  ]
}).catch(err => console.error(err));
