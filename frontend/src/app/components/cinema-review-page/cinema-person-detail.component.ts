import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { CinemaService } from 'src/app/services/cinema.service';
import { CinemaPersonDetail, CinemaPersonCredit } from 'src/app/models/responses/cinema-response';

// Bottom-sheet popup (not full-screen) shown when tapping a cast member row -
// bio + a horizontally-scrollable filmography (Acting/Directed toggle, full
// list sorted newest-first, no cap) + social/IMDb links. Fetched on-demand
// per person (not preloaded for the whole cast list) via GET /cinema/person/:id.
@Component({
  selector: 'app-cinema-person-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cinema-person-detail.component.html',
  styleUrl: './cinema-person-detail.component.css',
})
export class CinemaPersonDetailComponent implements OnInit, OnChanges, OnDestroy {
  @Input() personId: number | null = null;
  // Shown immediately (already have from the cast list) while the fuller
  // bio/filmography loads in behind it, so the sheet doesn't open empty.
  @Input() fallbackName = '';
  @Input() fallbackCharacter = '';
  @Input() fallbackProfilePath: string | null = null;

  @Output() close = new EventEmitter<void>();

  detail: CinemaPersonDetail | null = null;
  isLoading = false;
  activeTab: 'acting' | 'directed' = 'acting';
  isBioExpanded = false;

  constructor(private cinemaService: CinemaService) {}

  // Locks the underlying page's scroll while this sheet is open - without
  // this, if the sheet's own content is even slightly taller than the
  // viewport, the background scrolls instead of just the sheet's own
  // internal overflow-y-auto area.
  ngOnInit(): void {
    document.body.style.overflow = 'hidden';
  }

  ngOnDestroy(): void {
    document.body.style.overflow = '';
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['personId'] && this.personId) {
      this.detail = null;
      this.activeTab = 'acting';
      this.isBioExpanded = false;
      this.isLoading = true;
      this.cinemaService.getCinemaPersonDetail(this.personId).subscribe({
        next: (res) => {
          this.detail = res.data;
          this.isLoading = false;
        },
        error: () => {
          this.isLoading = false;
        },
      });
    }
  }

  get credits(): CinemaPersonCredit[] {
    if (!this.detail) return [];
    return this.activeTab === 'acting' ? this.detail.acting : this.detail.directed;
  }

  formattedYear(releaseDate: string | null): string {
    return releaseDate ? releaseDate.slice(0, 4) : 'TBA';
  }
}
