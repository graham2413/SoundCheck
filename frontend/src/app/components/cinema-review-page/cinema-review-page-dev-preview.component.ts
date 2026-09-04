import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CinemaReviewPageComponent } from './cinema-review-page.component';
import { CinemaService } from '../../services/cinema.service';
import { CinemaDetail } from '../../models/responses/cinema-response';

// Dev-only wrapper fetching real data from GET /api/cinema/detail/:mediaType/:tmdbId
// so the new cinema review page can be visually verified against live data
// without wiring it into the app's actual navigation yet. Defaults to The
// Dark Knight (155) if no query params are given.
// Usage: /dev-cinema-review?tmdbId=155&mediaType=movie
// Remove once this component replaces the review-page modal for cinema records.
@Component({
  selector: 'app-cinema-review-page-dev-preview',
  standalone: true,
  imports: [CommonModule, CinemaReviewPageComponent],
  template: `
    <div class="cinema-loader-overlay" *ngIf="!detail">
      <div class="cinema-loader-ring"></div>
      <p class="cinema-loader-text">Loading details…</p>
    </div>

    <app-cinema-review-page
      *ngIf="detail"
      [title]="detail.title"
      [cover]="detail.cover"
      [year]="detail.year"
      [runtimeMinutes]="detail.runtimeMinutes"
      [certification]="detail.certification"
      [releaseDate]="detail.releaseDate"
      [genres]="detail.genres"
      [imdbRating]="detail.imdbRating"
      [imdbVoteCount]="detail.imdbVoteCount"
      [description]="detail.description"
      [director]="detail.director"
      [awardsSummary]="detail.awardsSummary"
      [boxOffice]="detail.boxOffice"
      [watchProviders]="detail.watchProviders"
    ></app-cinema-review-page>
  `,
})
export class CinemaReviewPageDevPreviewComponent implements OnInit {
  detail: CinemaDetail | null = null;

  constructor(private route: ActivatedRoute, private cinemaService: CinemaService) {}

  ngOnInit(): void {
    const tmdbId = this.route.snapshot.queryParamMap.get('tmdbId') || '155';
    const mediaType = (this.route.snapshot.queryParamMap.get('mediaType') as 'movie' | 'tv') || 'movie';

    this.cinemaService.getCinemaDetail(mediaType, tmdbId).subscribe((res) => {
      this.detail = res.data;
    });
  }
}
