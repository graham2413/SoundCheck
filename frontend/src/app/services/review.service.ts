import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environments';
import {
  NewReviewResponse,
  Review,
  Reviews,
} from '../models/responses/review-responses';
import { CreateReviewCommandModel } from '../models/command-models/create-review-commandmodel';
import { PopularRecord } from '../models/responses/popular-record-response';
type PopularRecordResponse = {
  songs?: PopularRecord[];
  albums?: PopularRecord[];
  artists?: PopularRecord[];
};

type ActivityFeedCursor = {
  cursorDate: string;
  cursorId: string;
} | null;

type ActivityFeedResponse = {
  reviews: Review[];
  nextCursor: ActivityFeedCursor;
};
@Injectable({
  providedIn: 'root',
})
export class ReviewService {
  private apiUrl = environment.review;

  constructor(private http: HttpClient) {}

  searchReviews(id: number, type: string): Observable<Reviews> {
    const token = localStorage.getItem('token');

    if (!token) {
      console.error('No authentication token found');
      return new Observable();
    }

    const headers = { Authorization: `Bearer ${token}` };
    return this.http.get<Reviews>(`${this.apiUrl}/${id}/reviews?type=${type}`, {
      headers,
    });
  }

  createReview(
    command: CreateReviewCommandModel
  ): Observable<NewReviewResponse> {
    const token = localStorage.getItem('token');

    if (!token) {
      console.error('No authentication token found');
      return new Observable();
    }

    const headers = { Authorization: `Bearer ${token}` };

    return this.http.post<NewReviewResponse>(this.apiUrl, command, { headers });
  }

  editReview(
    reviewId: string,
    rating: number,
    reviewText: string
  ): Observable<NewReviewResponse> {
    const token = localStorage.getItem('token');

    if (!token) {
      console.error('No authentication token found');
      return new Observable();
    }

    const headers = { Authorization: `Bearer ${token}` };
    const body = {
      rating: rating,
      reviewText: reviewText,
    };

    return this.http.patch<NewReviewResponse>(
      `${this.apiUrl}/${reviewId}`,
      body,
      { headers }
    );
  }

  deleteReview(reviewId: string): Observable<void> {
    const token = localStorage.getItem('token');

    if (!token) {
      console.error('No authentication token found');
      return new Observable<void>();
    }

    const headers = { Authorization: `Bearer ${token}` };

    return this.http.delete<void>(`${this.apiUrl}/${reviewId}`, { headers });
  }

  getTopReviewsByType(
    type: 'Song' | 'Album' | 'Artist'
  ): Observable<PopularRecordResponse> {
    const token = localStorage.getItem('token');

    if (!token) {
      console.error('No authentication token found');
      return new Observable<PopularRecordResponse>();
    }

    const headers = { Authorization: `Bearer ${token}` };

    const endpoint =
      type === 'Song'
        ? 'top-songs'
        : type === 'Album'
        ? 'top-albums'
        : 'top-artists';

    return this.http.get<PopularRecordResponse>(`${this.apiUrl}/${endpoint}`, {
      headers,
    });
  }

getActivityFeed(params: {
  cursorDate?: string;
  cursorId?: string;
  limit?: number;
} = {}): Observable<ActivityFeedResponse> {
  const token = localStorage.getItem('token');

  if (!token) {
    console.error('No authentication token found');
    return new Observable<ActivityFeedResponse>();
  }

  const headers = { Authorization: `Bearer ${token}` };

  let httpParams = new HttpParams();
  if (params.cursorDate) {
    httpParams = httpParams.set('cursorDate', params.cursorDate);
  }
  if (params.cursorId) {
    httpParams = httpParams.set('cursorId', params.cursorId);
  }
  if (params.limit !== undefined) {
    httpParams = httpParams.set('limit', params.limit.toString());
  }

  return this.http.get<ActivityFeedResponse>(`${this.apiUrl}/activityFeed`, {
    headers,
    params: httpParams
  });
}

getProxiedImageUrl(originalUrl: string): string {
  return `${this.apiUrl}/image-proxy?url=${encodeURIComponent(originalUrl)}`;
}

toggleLike(reviewId: string): Observable<{ likes: number; likedByUser: boolean }> {
  const token = localStorage.getItem('token');

  if (!token) {
    console.error('No authentication token found');
    return new Observable();
  }

  const headers = { Authorization: `Bearer ${token}` };

  return this.http.post<{ likes: number; likedByUser: boolean }>(
    `${this.apiUrl}/${reviewId}/toggle-like`,
    {},
    { headers }
  );
}


}
