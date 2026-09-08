import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

// Lets any component temporarily force the navbar (desktop top bar + mobile
// bottom pill, both rendered by the single <app-navbar>) off-screen while
// it's open - e.g. the cinema rate/edit-review modal, which should be the
// only thing on screen. Uses a counter (not a plain boolean) so nested/
// overlapping hide() calls can't prematurely re-show it when one of them
// closes before the other.
@Injectable({ providedIn: 'root' })
export class NavbarVisibilityService {
  private hideCount = 0;
  private readonly hiddenSubject = new BehaviorSubject<boolean>(false);
  readonly hidden$ = this.hiddenSubject.asObservable();

  hide(): void {
    this.hideCount++;
    this.hiddenSubject.next(true);
  }

  show(): void {
    this.hideCount = Math.max(0, this.hideCount - 1);
    if (this.hideCount === 0) this.hiddenSubject.next(false);
  }
}
