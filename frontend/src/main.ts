import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideToastr } from 'ngx-toastr';
import { provideAnimations } from '@angular/platform-browser/animations';
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
    provideToastr({
      positionClass: 'toast-bottom-center',
      preventDuplicates: true,
      timeOut: 3000,
      closeButton: true, 
      progressBar: true,
      progressAnimation:'increasing'
    }),
    AuthService,
    SearchService
  ]
}).catch(err => console.error(err));
