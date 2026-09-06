import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SpotifyService } from 'src/app/services/spotify.service';
import { CinemaService } from 'src/app/services/cinema.service';
import { AlbumImage } from '../../../models/responses/album-images-response';
import { CinemaSearchResult } from '../../../models/responses/cinema-response';
import { getMovieReleaseBadge, movieReleaseBadgeLabel } from '../../../shared/movie-release-badge';
import { getMovieRereleaseBadge, movieRereleaseBadgeLabel } from '../../../shared/movie-rerelease-badge';
import { getTvEpisodeBadge, tvEpisodeBadgeLabel } from '../../../shared/tv-episode-badge';
import { getCinemaBadgeIcon } from '../../../shared/badge-icon';

export type SeeAllTrendingKind = 'music' | 'cinema';

// Full-screen "See All" grid, opened from the "Trending Right Now" row's
// "See All" button. Music shows every stored trending album (already only
// ~110, no pagination needed); cinema reuses the same trending endpoint as
// the marquee, with its own Movies/Shows toggle mirroring the marquee's.
@Component({
  selector: 'app-see-all-trending',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './see-all-trending.component.html',
  styleUrls: ['./see-all-trending.component.css'],
})
export class SeeAllTrendingComponent implements OnInit, OnChanges {
  @Input() kind: SeeAllTrendingKind = 'music';
  @Input() initialCinemaMode: 'movie' | 'tv' = 'movie';

  @Output() back = new EventEmitter<void>();
  @Output() musicCardClick = new EventEmitter<{ album: AlbumImage; list: AlbumImage[]; index: number }>();
  @Output() cinemaCardClick = new EventEmitter<{ item: CinemaSearchResult; list: CinemaSearchResult[]; index: number }>();

  isLoading = true;
  albums: AlbumImage[] = [];
  cinemaItems: CinemaSearchResult[] = [];
  cinemaMode: 'movie' | 'tv' = 'movie';

  constructor(
    private spotifyService: SpotifyService,
    private cinemaService: CinemaService
  ) {}

  ngOnInit(): void {
    this.cinemaMode = this.initialCinemaMode;
    this.loadData();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['kind'] && !changes['kind'].firstChange) {
      this.loadData();
    }
  }

  setCinemaMode(mode: 'movie' | 'tv'): void {
    if (this.cinemaMode === mode) return;
    this.cinemaMode = mode;
    this.loadData();
  }

  private loadData(): void {
    this.isLoading = true;
    if (this.kind === 'music') {
      this.spotifyService.getAlbumImages().subscribe({
        next: ({ albums }) => {
          this.albums = albums || [];
          this.isLoading = false;
        },
        error: () => {
          this.albums = [];
          this.isLoading = false;
        },
      });
    } else {
      this.cinemaService.getTrendingCinema(this.cinemaMode).subscribe({
        next: ({ data }) => {
          this.cinemaItems = data || [];
          this.isLoading = false;
        },
        error: () => {
          this.cinemaItems = [];
          this.isLoading = false;
        },
      });
    }
  }

  onMusicCardClick(index: number): void {
    this.musicCardClick.emit({ album: this.albums[index], list: this.albums, index });
  }

  onCinemaCardClick(index: number): void {
    this.cinemaCardClick.emit({ item: this.cinemaItems[index], list: this.cinemaItems, index });
  }

  releaseMonthYear(item: CinemaSearchResult): string {
    if (item.mediaType === 'tv' && item.releaseYearRange) return item.releaseYearRange;
    if (!item.releaseDate) return 'TBA';
    return new Date(item.releaseDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }

  private isComingSoon(releaseDate?: string | null): boolean {
    if (!releaseDate) return false;
    const todayStr = new Date().toISOString().slice(0, 10);
    return releaseDate.slice(0, 10) > todayStr;
  }

  // Same badge logic/priority/icons as the marquee (see cinema-marquee.component.ts) -
  // full label text here since this grid's cards have more room than the marquee.
  cinemaBadge(item: CinemaSearchResult): { kind: string; label: string; icon: string } | null {
    if (item.mediaType === 'tv') {
      const episodeBadge = getTvEpisodeBadge(item.lastEpisodeAirDate, item.nextEpisodeAirDate, item.nextEpisodeNumber);
      if (episodeBadge) return { kind: episodeBadge, label: tvEpisodeBadgeLabel(episodeBadge), icon: getCinemaBadgeIcon(episodeBadge) };
      if (this.isComingSoon(item.releaseDate)) return { kind: 'coming-soon', label: 'Coming Soon', icon: getCinemaBadgeIcon('coming-soon') };
      return null;
    }

    const releaseBadge = getMovieReleaseBadge({
      releaseDate: item.releaseDate,
      hadTheatricalRelease: item.hadTheatricalRelease,
      hasStreamingAvailability: item.hasStreamingAvailability,
      digitalReleaseDate: item.digitalReleaseDate,
    });
    if (releaseBadge) return { kind: releaseBadge, label: movieReleaseBadgeLabel(releaseBadge), icon: getCinemaBadgeIcon(releaseBadge) };
    const rereleaseBadge = getMovieRereleaseBadge(item.rereleaseDate);
    if (rereleaseBadge) return { kind: rereleaseBadge, label: movieRereleaseBadgeLabel(rereleaseBadge), icon: getCinemaBadgeIcon(rereleaseBadge) };
    if (this.isComingSoon(item.releaseDate)) return { kind: 'coming-soon', label: 'Coming Soon', icon: getCinemaBadgeIcon('coming-soon') };
    return null;
  }
}
