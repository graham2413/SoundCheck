import { CommonModule } from '@angular/common';
import {
  AfterViewChecked,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { CinemaService } from 'src/app/services/cinema.service';
import { CinemaPersonDetail, CinemaPersonCredit } from 'src/app/models/responses/cinema-response';
import { getCinemaStatusBadge, CinemaBadgeVm } from 'src/app/shared/cinema-status-badge';
import { CinemaBadgeComponent } from 'src/app/shared/cinema-badge/cinema-badge.component';

// Bottom-sheet popup (not full-screen) shown when tapping a cast member row -
// bio + a horizontally-scrollable filmography (Acting/Directed toggle, full
// list sorted newest-first, no cap) + social/IMDb links. Fetched on-demand
// per person (not preloaded for the whole cast list) via GET /cinema/person/:id.
@Component({
  selector: 'app-cinema-person-detail',
  standalone: true,
  imports: [CommonModule, CinemaBadgeComponent],
  templateUrl: './cinema-person-detail.component.html',
  styleUrl: './cinema-person-detail.component.css',
})
export class CinemaPersonDetailComponent implements OnInit, OnChanges, OnDestroy, AfterViewChecked {
  @Input() personId: number | null = null;
  // Shown immediately (already have from the cast list) while the fuller
  // bio/filmography loads in behind it, so the sheet doesn't open empty.
  @Input() fallbackName = '';
  @Input() fallbackCharacter = '';
  @Input() fallbackProfilePath: string | null = null;

  @Output() close = new EventEmitter<void>();
  @Output() creditClick = new EventEmitter<CinemaPersonCredit>();

  @ViewChild('bioText') bioTextEl?: ElementRef<HTMLParagraphElement>;

  detail: CinemaPersonDetail | null = null;
  isLoading = false;
  activeTab: 'acting' | 'directed' = 'acting';
  isBioExpanded = false;
  // Only true once the bio is actually measured to overflow its 3-line clamp -
  // without this, "Show more" showed for every bio regardless of length,
  // even ones that were already only a couple lines with nothing hidden.
  bioOverflows = false;
  private bioMeasured = false;
  creditImageLoaded: boolean[] = [];

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
      this.bioOverflows = false;
      this.bioMeasured = false;
      this.isLoading = true;
      this.cinemaService.getCinemaPersonDetail(this.personId).subscribe({
        next: (res) => {
          this.detail = res.data;
          this.isLoading = false;
          this.creditImageLoaded = new Array(this.credits.length).fill(false);
        },
        error: () => {
          this.isLoading = false;
        },
      });
    }
  }

  selectTab(tab: 'acting' | 'directed'): void {
    this.activeTab = tab;
    this.creditImageLoaded = new Array(this.credits.length).fill(false);
  }

  // Runs after every render, but only actually measures once per bio (guarded
  // by bioMeasured) and only once the element has real layout (clientHeight
  // > 0) - comparing scrollHeight to clientHeight while still 3-line-clamped
  // is what tells us whether there's actually hidden text to expand.
  ngAfterViewChecked(): void {
    if (this.bioMeasured || !this.detail?.biography || !this.bioTextEl) return;
    const el = this.bioTextEl.nativeElement;
    if (el.clientHeight === 0) return;
    this.bioOverflows = el.scrollHeight > el.clientHeight + 1;
    this.bioMeasured = true;
  }

  get credits(): CinemaPersonCredit[] {
    if (!this.detail) return [];
    return this.activeTab === 'acting' ? this.detail.acting : this.detail.directed;
  }

  formattedYear(releaseDate: string | null): string {
    return releaseDate ? releaseDate.slice(0, 4) : 'TBA';
  }

  // Same badge logic/priority/icons as everywhere else (see shared/cinema-status-badge.ts).
  // Filmography credits only carry mediaType/releaseDate (no theatrical/
  // streaming/episode-air-date fields), so in practice only "Coming Soon"
  // can ever show here - that's the honest subset available without an
  // extra per-title API call for every credit in a filmography.
  creditBadge(credit: CinemaPersonCredit): CinemaBadgeVm | null {
    return getCinemaStatusBadge(credit);
  }
}
