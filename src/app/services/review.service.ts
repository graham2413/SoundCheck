import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { env } from 'src/env';
import { NewReviewResponse, Reviews } from '../models/responses/review-responses';

@Injectable({
  providedIn: 'root'
})
export class ReviewService {
    private apiUrl = env.reviewUrl;

  constructor(private http: HttpClient) {}

  searchReviews(id: number, type: string): Observable<Reviews> {
    const token = localStorage.getItem('token');
  
    if (!token) {
      console.error("No authentication token found");
      return new Observable();
    }

    const headers = { Authorization: `Bearer ${token}` };
    return this.http.get<Reviews>(`${this.apiUrl}/${id}/reviews?type=${type}`, { headers });
  }

  createReview(id: number, type: string, rating: number, reviewText: string): Observable<NewReviewResponse> {
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
  
    return this.http.post<NewReviewResponse>(`${this.apiUrl}`, body, { headers });
  } 
  
  editReview(reviewId: string, rating: number, reviewText: string): Observable<NewReviewResponse> {
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
  
    return this.http.patch<NewReviewResponse>(`${this.apiUrl}/${reviewId}`, body, { headers });
  }

  deleteReview(reviewId: string): Observable<any> {
    const token = localStorage.getItem('token');
  
    if (!token) {
      console.error("No authentication token found");
      return new Observable();
    }
  
    const headers = { Authorization: `Bearer ${token}` };
  
    return this.http.delete<any>(`${this.apiUrl}/${reviewId}`, { headers });
  }  
  
}