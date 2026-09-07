import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CinemaBadgeVm } from '../cinema-status-badge';

// Single reusable presentational badge - same dark chip + icon + label look
// as the trending marquee everywhere a cinema status badge appears (marquee,
// See All, search results, watchlist, person-detail filmography). Add
// class="cinema-badge--overlay" on the host to position it absolutely over
// a poster (marquee-style); omit it to render inline (list/grid rows).
@Component({
  selector: 'app-cinema-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span *ngIf="badge" class="cinema-badge" [ngClass]="'badge-' + badge.kind">
      <i class="fas" [ngClass]="badge.icon"></i>
      {{ badge.label }}
    </span>
  `,
  styleUrls: ['./cinema-badge.component.css'],
})
export class CinemaBadgeComponent {
  @Input() badge: CinemaBadgeVm | null = null;
}
