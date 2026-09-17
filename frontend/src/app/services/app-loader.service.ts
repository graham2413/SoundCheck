import { Injectable } from '@angular/core';
import { Observable, ReplaySubject } from 'rxjs';

// Tracks when the app's full-screen boot loader (the equalizer-bars overlay
// shown in app.component.html while the initial profile fetch resolves) has
// actually finished fading away. The routed page underneath - and anything
// it renders, like the top-three podium - mounts and starts fetching at the
// same moment the loader *starts* leaving, well before it's actually gone
// (see the loaderFade animation's 350ms leave transition), so components
// that want their own entrance animation to read as happening after the
// loader is gone (not mid-fade, hidden underneath it) need this signal
// rather than timing themselves off their own mount.
@Injectable({ providedIn: 'root' })
export class AppLoaderService {
  // ReplaySubject(1): most components subscribe long after boot, well after
  // this has already fired once - they should get that past timestamp
  // immediately instead of waiting on an event that will never fire again.
  private readonly loaderGoneSubject = new ReplaySubject<number>(1);
  readonly loaderGone$: Observable<number> = this.loaderGoneSubject.asObservable();

  markLoaderGone(): void {
    this.loaderGoneSubject.next(Date.now());
  }
}
