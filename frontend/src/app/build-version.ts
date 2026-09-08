// Overwritten by scripts/build-version-json.js during the CI build, right
// before `ng build` runs - baked into the compiled bundle so the running app
// can compare itself against the live /version.json at runtime (see
// app.component.ts) without depending on the Angular Service Worker's own
// update-check timing.
export const CURRENT_BUILD_NUMBER = '0';
