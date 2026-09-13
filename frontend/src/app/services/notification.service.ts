import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { SwPush } from '@angular/service-worker';
import { Observable, from, of } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { environment } from 'src/environments/environments';

export interface AppNotification {
  _id: string;
  type: 'music-release' | 'movie-release' | 'tv-episode' | 'tv-season' | 'weekly-summary';
  title: string;
  message: string;
  targetUrl: string;
  details?: { movies?: string[]; tv?: string[]; music?: string[] } | null;
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

  constructor(private http: HttpClient, private swPush: SwPush) {}

  getNotifications(): Observable<{ notifications: AppNotification[] }> {
    return this.http.get<{ notifications: AppNotification[] }>(`${this.apiUrl}/notifications`, { headers: this.headers() });
  }

  deleteNotification(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/notifications/${id}`, { headers: this.headers() });
  }

  deleteAllNotifications(): Observable<{ deletedCount: number }> {
    return this.http.delete<{ deletedCount: number }>(`${this.apiUrl}/notifications`, { headers: this.headers() });
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
