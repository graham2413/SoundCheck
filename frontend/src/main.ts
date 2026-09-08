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
    // Note: a commit that ONLY touches .github/workflows/deploy.yml can
    // fail to self-trigger the deploy workflow (a known GitHub Actions
    // gotcha with a workflow's own path filters) - always pair a
    // deploy.yml-only fix with a real frontend/** change like this one so
    // the fix actually goes live instead of sitting committed but unreleased.
    SearchService, provideServiceWorker('ngsw-worker.js', {
            enabled: !isDevMode(),
            // Register right away instead of waiting on app-stability, so the
            // update check runs in parallel with initial load instead of after it
            registrationStrategy: 'registerImmediately'
          })
  ]
}).catch(err => console.error(err));
