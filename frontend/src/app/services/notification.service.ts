import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { SwPush } from '@angular/service-worker';
import { BehaviorSubject, Observable, from, of } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { environment } from 'src/environments/environments';

// One flexible shape covering every notification type's payload (mirrors how
// CinemaItem itself is one big optional-field interface rather than a
// discriminated union) - which fields are populated depends on `type`:
// weekly-summary uses movies/tv/music; movie-release/tv-episode/tv-season use
// the CinemaItem identity fields; music-release uses the Release fields.
export interface AppNotificationDetails {
  movies?: string[];
  tv?: string[];
  music?: string[];
  _id?: string;
  tmdbId?: string;
  mediaType?: 'movie' | 'tv';
  imdbId?: string;
  canonicalId?: string;
  title?: string;
  cover?: string;
  isWatchlist?: boolean;
  isWatched?: boolean;
  decimalRating?: number;
  reviewText?: string;
  containsSpoilers?: boolean;
  isUnrefinedImport?: boolean;
  albumId?: string;
  artistName?: string;
  isExplicit?: boolean;
  releaseDate?: string;
  recordType?: string | null;
}

export interface AppNotification {
  _id: string;
  type: 'music-release' | 'movie-release' | 'tv-episode' | 'tv-season' | 'weekly-summary';
  title: string;
  message: string;
  targetUrl: string;
  details?: AppNotificationDetails | null;
  createdAt: string;
}

export interface NotificationPreferences {
  immediateMusic: boolean;
  immediateMovies: boolean;
  immediateTvEpisodes: boolean;
  immediateTvSeasons: boolean;
  weeklySummary: boolean;
  weeklySummaryDay: number;
  weeklySummaryHour: number;
  timezone: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly apiUrl = environment.user;

  // Shared "how many notifications exist" count (not read/unread - there's no
  // such field) so the navbar bell and the profile-page bell both reflect the
  // same number without each independently re-fetching the full list.
  private readonly notificationCountSubject = new BehaviorSubject<number>(0);
  readonly notificationCount$ = this.notificationCountSubject.asObservable();

  constructor(private http: HttpClient, private swPush: SwPush) {}

  getNotifications(): Observable<{ notifications: AppNotification[] }> {
    return this.http.get<{ notifications: AppNotification[] }>(`${this.apiUrl}/notifications`, { headers: this.headers() });
  }

  refreshNotificationCount(): void {
    this.getNotifications().subscribe({
      next: ({ notifications }) => this.notificationCountSubject.next(notifications.length),
    });
  }

  deleteNotification(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/notifications/${id}`, { headers: this.headers() }).pipe(
      tap(() => this.notificationCountSubject.next(Math.max(0, this.notificationCountSubject.value - 1)))
    );
  }

  deleteAllNotifications(): Observable<{ deletedCount: number }> {
    return this.http.delete<{ deletedCount: number }>(`${this.apiUrl}/notifications`, { headers: this.headers() }).pipe(
      tap(() => this.notificationCountSubject.next(0))
    );
  }

  getPreferences(): Observable<{ preferences: NotificationPreferences }> {
    return this.http.get<{ preferences: NotificationPreferences }>(`${this.apiUrl}/notifications/preferences`, { headers: this.headers() });
  }

  updatePreferences(preferences: Partial<NotificationPreferences>): Observable<{ preferences: NotificationPreferences }> {
    return this.http.put<{ preferences: NotificationPreferences }>(`${this.apiUrl}/notifications/preferences`, preferences, { headers: this.headers() });
  }

  enablePush(): Observable<boolean> {
    if (!this.swPush.isEnabled || !environment.vapidPublicKey) return of(false);

    return from(Notification.requestPermission()).pipe(
      switchMap((permission) => {
        if (permission !== 'granted') return of(false);
        return from(this.swPush.requestSubscription({ serverPublicKey: environment.vapidPublicKey })).pipe(
          switchMap((subscription) => this.http.put(`${this.apiUrl}/notifications/subscription`, subscription.toJSON(), { headers: this.headers() })),
          switchMap(() => of(true))
        );
      }),
      catchError(() => of(false))
    );
  }

  disablePush(): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/notifications/subscription`, { headers: this.headers() }).pipe(
      tap(() => this.swPush.unsubscribe().catch(() => {}))
    );
  }

  private headers(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token') || ''}` });
  }
}
