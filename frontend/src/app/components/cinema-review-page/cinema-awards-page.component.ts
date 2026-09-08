import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

// Phase 1 Awards full-screen page - only OMDb's single "Awards" summary
// sentence is available as a data source (see cinemaController.js's
// parseAwardsStats/parseAwardsSummary), so this deliberately does NOT show
// organization/category grouping, filters, or expandable rows - none of
// that structured data exists anywhere in this app's sources today. See
// project notes for the Phase 2 structured-awards-source investigation.
@Component({
  selector: 'app-cinema-awards-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cinema-awards-page.component.html',
  styleUrls: ['./cinema-awards-page.component.css'],
})
export class CinemaAwardsPageComponent {
  @Input() title = '';
  @Input() cover: string | null = null;
  @Input() mediaType: 'movie' | 'tv' | null = null;
  @Input() year: number | null = null;
  @Input() releaseYearRange: string | null = null;
  @Input() runtimeMinutes: number | null = null;
  @Input() certification: string | null = null;
  @Input() genres: string[] = [];
  @Input() awardsRaw: string | null = null;
  @Input() awardsStats: {
    oscarWins: number | null;
    emmyWins: number | null;
    emmyNominations: number | null;
    otherWins: number | null;
    nominations: number | null;
  } | null = null;

  @Output() back = new EventEmitter<void>();

  get yearLabel(): string | null {
    if (this.mediaType === 'tv' && this.releaseYearRange) return this.releaseYearRange;
    return this.year ? String(this.year) : null;
  }

  get runtimeLabel(): string | null {
    if (!this.runtimeMinutes) return null;
    const hours = Math.floor(this.runtimeMinutes / 60);
    const minutes = this.runtimeMinutes % 60;
    if (hours && minutes) return `${hours}h ${minutes}m`;
    if (hours) return `${hours}h`;
    return `${minutes}m`;
  }

  // Oscars only apply to movies, Emmys only to TV - shown in the same "top
  // wins" tile rather than as a 4th stat, so movies/shows each get whichever
  // one is actually relevant to them instead of both always being present.
  // For TV, falls back to Emmy *nominations* when there's no Emmy win yet
  // (e.g. "Nominated for 1 Primetime Emmy") - otherwise a nominated-but-not-
  // won show would show no Emmy info at all, just the generic total noms.
  get primaryWinsLabel(): string {
    if (this.mediaType !== 'tv') return 'Oscar Wins';
    return this.awardsStats?.emmyWins != null ? 'Emmy Wins' : 'Emmy Nominations';
  }

  get primaryWinsValue(): number | null {
    if (!this.awardsStats) return null;
    if (this.mediaType !== 'tv') return this.awardsStats.oscarWins;
    return this.awardsStats.emmyWins ?? this.awardsStats.emmyNominations;
  }

  get hasAnyStat(): boolean {
    return (
      !!this.awardsStats &&
      (this.primaryWinsValue != null || this.awardsStats.otherWins != null || this.awardsStats.nominations != null)
    );
  }
}
