import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideToastr } from 'ngx-toastr';
import { provideAnimations } from '@angular/platform-browser/animations';
import { AuthService } from './app/services/auth.service';
import { SearchService } from './app/services/search.service';
import { appRoutes } from './app/app-routing.module';
import { isDevMode } from '@angular/core';
import { provideServiceWorker } from '@angular/service-worker';

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept();
}

bootstrapApplication(AppComponent, {
  providers: [
    provideHttpClient(),
    provideRouter(
      appRoutes,
      withInMemoryScrolling({ scrollPositionRestoration: 'top' })
    ),
    provideAnimations(),
    provideToastr({
      positionClass: 'toast-top-center',
      preventDuplicates: true,
      timeOut: 2500,
      closeButton: true, 
      progressBar: true,
      progressAnimation:'increasing'
    }),
    AuthService,
    SearchService, provideServiceWorker('ngsw-worker.js', {
            enabled: !isDevMode(),
            registrationStrategy: 'registerWhenStable:30000'
          })
  ]
}).catch(err => console.error(err));
