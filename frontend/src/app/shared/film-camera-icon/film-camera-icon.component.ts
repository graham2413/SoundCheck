import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

// Outline film-camera glyph (two overlapping reels above a camera body with
// viewfinder) used on the Music/Cinema switch buttons - replaces the old
// fa-film glyph so both switch buttons (main search + calendar) share one
// icon. Pure stroke, no fill, so it inherits color via currentColor like the
// text it sits next to.
@Component({
  selector: 'app-film-camera-icon',
  standalone: true,
  imports: [CommonModule],
  template: `
    <svg viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-full h-full">
      <circle cx="104" cy="140" r="80" stroke="currentColor" stroke-width="24" />
      <circle cx="104" cy="140" r="28" stroke="currentColor" stroke-width="24" />
      <circle cx="304" cy="112" r="95" stroke="currentColor" stroke-width="24" />
      <circle cx="304" cy="112" r="8" fill="currentColor" />
      <circle cx="304" cy="82" r="8" fill="currentColor" />
      <circle cx="304" cy="142" r="8" fill="currentColor" />
      <circle cx="334" cy="112" r="8" fill="currentColor" />
      <circle cx="274" cy="112" r="8" fill="currentColor" />
      <rect x="16" y="248" width="384" height="248" rx="32" stroke="currentColor" stroke-width="24" />
      <rect x="64" y="344" width="176" height="96" rx="8" stroke="currentColor" stroke-width="24" />
      <circle cx="304" cy="310" r="32" stroke="currentColor" stroke-width="24" />
      <rect x="280" y="368" width="48" height="48" rx="8" stroke="currentColor" stroke-width="24" />
      <circle cx="192" cy="490" r="8" fill="currentColor" />
      <path d="M400 296 L488 260 V434 L400 398 Z" stroke="currentColor" stroke-width="24" stroke-linejoin="round" />
    </svg>
  `,
})
export class FilmCameraIconComponent {}
