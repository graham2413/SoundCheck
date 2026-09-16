import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environments';
import { TopThreeCategory, TopThreeItem, TopThreeResponse } from '../models/responses/top-three.response';

@Injectable({
  providedIn: 'root',
})
export class TopThreeService {
  private apiUrl = environment.user;

  constructor(private http: HttpClient) {}

  private authHeaders() {
    const token = localStorage.getItem('token');
    return { Authorization: `Bearer ${token}` };
  }

  // Own podium - always full data regardless of isPublic (you can always see
  // your own picks, even while they're set to private).
  getMyTopThree(): Observable<TopThreeResponse> {
    return this.http.get<TopThreeResponse>(`${this.apiUrl}/top-three`, { headers: this.authHeaders() });
  }

  // Someone else's podium - backend returns just { isPublic: false } if
  // they've kept it private, so the card can fall back to an empty view
  // without a 403.
  getUserTopThree(userId: string): Observable<TopThreeResponse | { isPublic: false }> {
    return this.http.get<TopThreeResponse | { isPublic: false }>(`${this.apiUrl}/top-three/${userId}`);
  }

  setCategory(category: TopThreeCategory, items: TopThreeItem[]): Observable<{ message: string; category: TopThreeCategory; items: TopThreeItem[] }> {
    return this.http.put<{ message: string; category: TopThreeCategory; items: TopThreeItem[] }>(
      `${this.apiUrl}/top-three/${category}`,
      { items },
      { headers: this.authHeaders() }
    );
  }

  setAuto(category: TopThreeCategory): Observable<{ message: string; category: TopThreeCategory; items: TopThreeItem[] }> {
    return this.http.put<{ message: string; category: TopThreeCategory; items: TopThreeItem[] }>(
      `${this.apiUrl}/top-three/${category}/auto`,
      {},
      { headers: this.authHeaders() }
    );
  }

  setVisibility(isPublic: boolean): Observable<{ message: string; isPublic: boolean }> {
    return this.http.put<{ message: string; isPublic: boolean }>(
      `${this.apiUrl}/top-three/visibility`,
      { isPublic },
      { headers: this.authHeaders() }
    );
  }
}
