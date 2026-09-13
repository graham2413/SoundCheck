import { CommonModule } from '@angular/common';
import { animate, animateChild, query, stagger, style, transition, trigger } from '@angular/animations';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CinemaSoundtrackTrack } from '../../models/responses/cinema-response';

type SoundtrackSource = 'soundtrackdb' | 'musicbrainz' | null;

// Full-screen Soundtrack view (opened from the "View full soundtrack" row on
// Overview) - purely presentational, same header/back-button pattern as
// cinema-cast-list/cinema-awards-page. The host (cinema-review-modal) owns
// fetching (lazy, on first open) and the click-through Deezer resolve + open
// review modal flow - this component just renders whatever it's given.
@Component({
  selector: 'app-cinema-soundtrack-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cinema-soundtrack-list.component.html',
  styleUrl: './cinema-soundtrack-list.component.css',
  animations: [
    trigger('fadeSlideIn', [
      transition(':enter', [
        query('@itemAnim', [stagger(50, animateChild())], { optional: true }),
      ]),
    ]),
    trigger('itemAnim', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(-20px)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateX(0)' })),
      ]),
    ]),
  ],
})
export class CinemaSoundtrackListComponent {
  @Input() title = '';
  @Input() cover: string | null = null;
  @Input() tracks: CinemaSoundtrackTrack[] = [];
  @Input() isLoading = false;
  @Input() available = false;
  @Input() source: SoundtrackSource = null;
  // Only ever set for the 'soundtrackdb' source - lets the badge open the
  // real Spotify playlist this list came from.
  @Input() playlistUrl: string | null = null;
  // Index of the one row currently resolving to a Deezer track (null = none) -
  // only ever one at a time since resolution happens on tap, not in bulk.
  @Input() resolvingTrackIndex: number | null = null;

  @Output() back = new EventEmitter<void>();
  @Output() trackClick = new EventEmitter<{ track: CinemaSoundtrackTrack; index: number }>();

  get sourceLabel(): string {
    if (this.source === 'soundtrackdb') return 'Spotify Playlist';
    if (this.source === 'musicbrainz') return 'Official Album';
    return '';
  }

  get sourceIcon(): string {
    return this.source === 'soundtrackdb' ? 'fab fa-spotify' : 'fas fa-compact-disc';
  }

  get sourceFinePrint(): string {
    if (this.source === 'soundtrackdb') {
      return "Sourced from this title's official Spotify soundtrack playlist - a title's full in-scene music may include additional songs not shown here.";
    }
    return 'Sourced from officially released soundtrack/score albums via MusicBrainz - a title\'s full in-scene music may include additional songs not shown here.';
  }

  // Total runtime across every track that actually has a duration - some
  // MusicBrainz tracks lack `length` data, so this is a best-effort sum, not
  // guaranteed to reflect every listed track.
  get totalDurationLabel(): string | null {
    const totalMs = this.tracks.reduce((sum, t) => sum + (t.durationMs || 0), 0);
    if (totalMs <= 0) return null;

    const totalMinutes = Math.round(totalMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours}H ${minutes}M` : `${minutes} MIN`;
  }

  onTrackClick(track: CinemaSoundtrackTrack, index: number): void {
    if (this.resolvingTrackIndex != null) return; // one resolve in flight at a time
    this.trackClick.emit({ track, index });
  }
}
