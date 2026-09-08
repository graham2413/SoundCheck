import { Injectable } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { CURRENT_BUILD_NUMBER } from '../build-version';

// Centralizes the "is a newer build live" check and the resulting banner
// state, so both the app-wide forced-update overlay (app.component, polled
// automatically) and the manual "Check for updates" button (user-profile
// page) share one source of truth instead of duplicating the comparison.
@Injectable({ providedIn: 'root' })
export class UpdateService {
  updateAvailable = false;
  updateNotes: Record<string, string[]> = {};
  updateBuildNumber = '';

  constructor(private swUpdate: SwUpdate) {}

  // Also nudges the SW to re-check/download in the background on its own,
  // rather than only relying on it to notice on its own schedule - installed
  // home-screen PWAs (iOS especially) are heavily background-execution
  // restricted and may otherwise go a very long time between self-checks.
  // Returns true if a newer build was found (and the banner state was set).
  async checkForNewVersion(): Promise<boolean> {
    if (this.swUpdate.isEnabled) this.swUpdate.checkForUpdate().catch(() => {});

    try {
      const res = await fetch(`/version.json?_=${Date.now()}`, { cache: 'no-store' });
      const data = await res.json();
      const latestBuildNumber = data?.buildNumber || '';
      if (!latestBuildNumber || latestBuildNumber === CURRENT_BUILD_NUMBER) return false;
      this.updateAvailable = true;
      this.updateNotes = data?.notes || {};
      this.updateBuildNumber = latestBuildNumber;
      return true;
    } catch {
      return false;
    }
  }
}
