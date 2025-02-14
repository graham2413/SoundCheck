import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { env } from 'src/env';
import { CreatedReviewResponse } from '../models/responses/review-responses';

@Injectable({
  providedIn: 'root'
})
export class ReviewService {
    private apiUrl = env.reviewUrl;

  constructor(private http: HttpClient) {}

  searchReviews(id: number, type: string): Observable<any> {
    const token = localStorage.getItem('token');
  
    if (!token) {
      console.error("No authentication token found");
      return new Observable();
    }

    const headers = { Authorization: `Bearer ${token}` };
    return this.http.get<any>(`${this.apiUrl}/${id}/reviews?type=${type}`, { headers });
  }

  createReview(id: number, type: string, rating: number, reviewText: string): Observable<CreatedReviewResponse> {
    const token = localStorage.getItem('token');
  
    if (!token) {
      console.error("No authentication token found");
      return new Observable();
    }
  
    const headers = { Authorization: `Bearer ${token}` };
    const body = {
      albumSongOrArtistId: id,
      type: type,
      rating: rating,
      reviewText: reviewText,
    };
  
    return this.http.post<any>(`${this.apiUrl}`, body, { headers });
  } 
  
  editReview(reviewId: string, rating: number, reviewText: string): Observable<CreatedReviewResponse> {
    const token = localStorage.getItem('token');
  
    if (!token) {
      console.error("No authentication token found");
      return new Observable();
    }
  
    const headers = { Authorization: `Bearer ${token}` };
    const body = {
      rating: rating,
      reviewText: reviewText,
    };
  
    return this.http.patch<any>(`${this.apiUrl}/${reviewId}`, body, { headers });
  }  
  
}