import { enableProdMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { AppModule } from './app/app.module';
import { environment } from './environments/environment';

declare const module: any;

if (environment.production) {
  enableProdMode();
} else if (module?.hot) { 
  console.log('%c[HMR] Hot Module Replacement is ENABLED', 'color: #28a745; font-weight: bold;');
  module.hot.accept();
} else {
  console.log('%c[HMR] Hot Module Replacement is NOT enabled.', 'color: #dc3545; font-weight: bold;');
}

platformBrowserDynamic()
  .bootstrapModule(AppModule)
  .catch(err => console.error(err));
