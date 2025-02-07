import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { env } from '../../env';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private apiUrl = env.userUrl;

  constructor(private http: HttpClient) {}

  getAuthenticatedUserProfile(): Observable<any> {
    const token = localStorage.getItem('token');
  
    if (!token) {
      console.error("No authentication token found");
      return new Observable();
    }
  
    const headers = { Authorization: `Bearer ${token}` };
    return this.http.get<any>(`${this.apiUrl}/profile`, { headers });
  }

    // Update authenticated user profile
    updateUserProfile(formData: FormData): Observable<any> {
      const token = localStorage.getItem('token');
    
      if (!token) {
        console.error("No authentication token found");
        return new Observable();
      }
    
      return this.http.put<any>(`${this.apiUrl}/profile`, formData, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
    }
    
  
}
