import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environments';
import { CinemaItem, ImdbStatsResponse } from '../models/responses/cinema-response';

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

  // A user's watchlist - owner always allowed, others only if public
  getWatchlist(userId: string): Observable<{ success: boolean; data: CinemaItem[] }> {
    return this.http.get<{ success: boolean; data: CinemaItem[] }>(`${this.apiUrl}/watchlist/${userId}`, {
      headers: this.authHeaders(),
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
}
