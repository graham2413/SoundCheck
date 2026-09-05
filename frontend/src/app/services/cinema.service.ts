import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environments';
import { CinemaItem, CinemaReviewsResponse, CinemaSearchResult, ImdbStatsResponse, CalendarEntry, CinemaDetailResponse, CinemaPersonDetailResponse, CinemaPopularActor } from '../models/responses/cinema-response';

export interface WatchlistCursor {
  cursorValue: string;
  cursorId: string;
}

export interface WatchlistFilters {
  mediaType?: 'movie' | 'tv';
  search?: string;
  status?: 'unwatched' | 'watched';
  releaseStatus?: 'available' | 'in_theaters' | 'coming_soon';
  genre?: string;
  provider?: string;
  hasReleaseDate?: boolean;
  hasRating?: boolean;
  sortBy?: 'dateAdded' | 'releaseDate' | 'title';
  sortOrder?: 'asc' | 'desc';
}

export interface WatchlistResponse {
  success: boolean;
  data: CinemaItem[];
  nextCursor: WatchlistCursor | null;
  totalCount: number;
  watchlistCount: number;
}

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

  // Consolidated detail payload for the cinema review page (TMDb metadata/credits/providers + OMDb ratings/awards)
  getCinemaDetail(mediaType: 'movie' | 'tv', tmdbId: string): Observable<CinemaDetailResponse> {
    return this.http.get<CinemaDetailResponse>(`${this.apiUrl}/detail/${mediaType}/${tmdbId}`, {
      headers: this.authHeaders(),
    });
  }

  // Bio + filmography + social links for the cast detail popup
  getCinemaPersonDetail(personId: number): Observable<CinemaPersonDetailResponse> {
    return this.http.get<CinemaPersonDetailResponse>(`${this.apiUrl}/person/${personId}`, {
      headers: this.authHeaders(),
    });
  }

  // Top 50 Actors ranking, TMDb-wide (not scoped to any single title)
  getPopularActors(): Observable<{ success: boolean; data: CinemaPopularActor[] }> {
    return this.http.get<{ success: boolean; data: CinemaPopularActor[] }>(`${this.apiUrl}/popular-actors`, {
      headers: this.authHeaders(),
    });
  }

  // Search movies/shows via TMDb
  searchCinema(query: string): Observable<{ success: boolean; data: CinemaSearchResult[] }> {
    return this.http.get<{ success: boolean; data: CinemaSearchResult[] }>(`${this.apiUrl}/search`, {
      headers: this.authHeaders(),
      params: { query },
    });
  }

  // A user's watchlist - owner always allowed, others only if public.
  // Cursor-paginated (same pattern as the activity/artist feeds) so a large
  // watchlist doesn't have to load/render all at once. All narrowing options
  // live on `filters` (all optional/omittable for "no filter").
  getWatchlist(
    userId: string,
    cursor?: WatchlistCursor | null,
    filters: WatchlistFilters = {}
  ): Observable<WatchlistResponse> {
    let params: Record<string, string> = { limit: '30' };
    if (cursor) {
      params = { ...params, cursorValue: cursor.cursorValue, cursorId: cursor.cursorId };
    }
    if (filters.mediaType) params = { ...params, mediaType: filters.mediaType };
    if (filters.search?.trim()) params = { ...params, search: filters.search.trim() };
    if (filters.status) params = { ...params, status: filters.status };
    if (filters.releaseStatus) params = { ...params, releaseStatus: filters.releaseStatus };
    if (filters.genre) params = { ...params, genre: filters.genre };
    if (filters.provider) params = { ...params, provider: filters.provider };
    if (filters.hasReleaseDate) params = { ...params, hasReleaseDate: 'true' };
    if (filters.hasRating) params = { ...params, hasRating: 'true' };
    if (filters.sortBy) params = { ...params, sortBy: filters.sortBy };
    if (filters.sortOrder) params = { ...params, sortOrder: filters.sortOrder };

    return this.http.get<WatchlistResponse>(`${this.apiUrl}/watchlist/${userId}`, {
      headers: this.authHeaders(),
      params,
    });
  }

  // Distinct genres/providers actually present in the user's watchlist -
  // powers the Genre/Availability dropdowns in the filter overlay.
  getWatchlistFilterOptions(
    userId: string
  ): Observable<{ success: boolean; genres: string[]; providers: string[] }> {
    return this.http.get<{ success: boolean; genres: string[]; providers: string[] }>(
      `${this.apiUrl}/watchlist/${userId}/filters`,
      { headers: this.authHeaders() }
    );
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

  // Toggles watched WITHOUT a rating (e.g. "seen it, don't want to rate it") -
  // data is null if the item had nothing else tracking it and got deleted.
  markWatched(payload: {
    tmdbId: string;
    mediaType: 'movie' | 'tv';
    title: string;
    cover?: string;
    releaseDate?: string;
  }): Observable<{ success: boolean; data: CinemaItem | null }> {
    return this.http.post<{ success: boolean; data: CinemaItem | null }>(
      `${this.apiUrl}/mark-watched`,
      payload,
      { headers: this.authHeaders() }
    );
  }

  // Upcoming (default) or past episodes/releases for the current user's
  // tracked shows/movies. TMDb lookups are cached for 24h server-side; pass
  // forceRefresh to bypass.
  getCalendar(forceRefresh = false, range: 'upcoming' | 'past' = 'upcoming'): Observable<{ success: boolean; data: CalendarEntry[] }> {
    let params: Record<string, string> = { range };
    if (forceRefresh) params = { ...params, refresh: 'true' };

    return this.http.get<{ success: boolean; data: CalendarEntry[] }>(`${this.apiUrl}/calendar`, {
      headers: this.authHeaders(),
      params,
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
