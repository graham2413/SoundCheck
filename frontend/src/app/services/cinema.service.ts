import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environments';
import { CinemaItem, CinemaReviewsResponse, CinemaSearchResult, ImdbStatsResponse, CalendarEntry } from '../models/responses/cinema-response';

@Injectable({
  providedIn: 'root'
})
export class CinemaService {
  private apiUrl = environment.cinema;

  constructor(private http: HttpClient) {}

  private authHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  // Live IMDb community rating/vote count (Redis-cached on backend, no auth required)
  getImdbStats(imdbId: string): Observable<ImdbStatsResponse> {
    return this.http.get<ImdbStatsResponse>(`${this.apiUrl}/imdb-stats/${imdbId}`);
  }

  // Search movies/shows via TMDb
  searchCinema(query: string): Observable<{ success: boolean; data: CinemaSearchResult[] }> {
    return this.http.get<{ success: boolean; data: CinemaSearchResult[] }>(`${this.apiUrl}/search`, {
      headers: this.authHeaders(),
      params: { query },
    });
  }

  // A user's watchlist - owner always allowed, others only if public
  getWatchlist(userId: string): Observable<{ success: boolean; data: CinemaItem[] }> {
    return this.http.get<{ success: boolean; data: CinemaItem[] }>(`${this.apiUrl}/watchlist/${userId}`, {
      headers: this.authHeaders(),
    });
  }

  // Add/remove a movie or show from the current user's watchlist
  toggleWatchlist(payload: {
    tmdbId: string;
    mediaType: 'movie' | 'tv';
    title: string;
    cover?: string;
    releaseDate?: string;
  }): Observable<{ success: boolean; data: { isWatchlist: boolean; item: CinemaItem | null } }> {
    return this.http.post<{ success: boolean; data: { isWatchlist: boolean; item: CinemaItem | null } }>(
      `${this.apiUrl}/watchlist/toggle`,
      payload,
      { headers: this.authHeaders() }
    );
  }

  // Upcoming episodes/releases for the current user's tracked shows/movies.
  // TMDb lookups are cached for 24h server-side; pass forceRefresh to bypass.
  getCalendar(forceRefresh = false): Observable<{ success: boolean; data: CalendarEntry[] }> {
    return this.http.get<{ success: boolean; data: CalendarEntry[] }>(`${this.apiUrl}/calendar`, {
      headers: this.authHeaders(),
      params: forceRefresh ? { refresh: 'true' } : {},
    });
  }

  // Import a Trakt data-export zip (ratings + watchlist) as CinemaItems for the current user
  importTraktExport(file: File): Observable<{
    success: boolean;
    data: { imported: number; skipped: number; duplicates: number; total: number; coversUpdated: number };
  }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{
      success: boolean;
      data: { imported: number; skipped: number; duplicates: number; total: number; coversUpdated: number };
    }>(
      `${this.apiUrl}/import-trakt`,
      formData,
      { headers: this.authHeaders() }
    );
  }

  // Submit a precise decimal rating (and optionally review text) for an imported item
  editCinemaItem(id: string, decimalRating: number, reviewText?: string): Observable<{ success: boolean; data: CinemaItem }> {
    return this.http.patch<{ success: boolean; data: CinemaItem }>(
      `${this.apiUrl}/${id}/refine`,
      { decimalRating, ...(reviewText !== undefined ? { reviewText } : {}) },
      { headers: this.authHeaders() }
    );
  }

  // Everyone's reviews (rating + text) for the same movie/show as `item`
  getCinemaReviews(item: CinemaItem): Observable<{ success: boolean; data: CinemaReviewsResponse }> {
    let params = new HttpParams();

    if (item.imdbId) {
      params = params.set('imdbId', item.imdbId);
    } else if (item.tmdbId) {
      params = params.set('tmdbId', item.tmdbId).set('mediaType', item.mediaType);
    } else if (item.canonicalId) {
      params = params.set('canonicalId', item.canonicalId).set('mediaType', item.mediaType);
    }

    return this.http.get<{ success: boolean; data: CinemaReviewsResponse }>(`${this.apiUrl}/reviews`, {
      headers: this.authHeaders(),
      params,
    });
  }
}
