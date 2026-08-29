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
}
