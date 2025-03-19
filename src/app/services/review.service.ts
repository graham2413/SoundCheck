import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environments';
import { NewReviewResponse, Reviews } from '../models/responses/review-responses';
import { CreateReviewCommandModel } from '../models/command-models/create-review-commandmodel';

@Injectable({
  providedIn: 'root'
})
export class ReviewService {
    private apiUrl = environment.review;

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

  createReview(command: CreateReviewCommandModel): Observable<NewReviewResponse> {
    const token = localStorage.getItem("token");

    if (!token) {
      console.error("No authentication token found");
      return new Observable();
    }

    const headers = { Authorization: `Bearer ${token}` };

    return this.http.post<NewReviewResponse>(this.apiUrl, command, { headers });
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