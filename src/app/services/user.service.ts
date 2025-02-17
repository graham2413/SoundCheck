import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { env } from '../../env';
import { tap } from 'rxjs/operators';
import { User } from '../models/responses/user.response';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private apiUrl = env.userUrl;
  private userProfileSubject = new BehaviorSubject<any>(null);
  userProfile$ = this.userProfileSubject.asObservable();

  constructor(private http: HttpClient) {}

  getAuthenticatedUserProfile(): Observable<any> {
    const token = localStorage.getItem('token');
  
    if (!token) {
      console.error("No authentication token found");
      return new Observable();
    }

    const headers = { Authorization: `Bearer ${token}` };

    return this.http.get<any>(`${this.apiUrl}/profile`, { headers }).pipe(
      tap((profile) => {
        if (profile) {
          profile.profilePicture = profile.profilePicture?.trim() ? 
            `${profile.profilePicture}?t=${new Date().getTime()}` : 
            'assets/user.png';

          this.userProfileSubject.next(profile);
        }
      }));
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

    setUserProfile(profile: any) {
      this.userProfileSubject.next(profile);
    }

    searchUsers(query: string): Observable<User[]> {
      const token = localStorage.getItem('token');
    
      if (!token) {
        console.error("No authentication token found");
        return new Observable();
      }
      const headers = { Authorization: `Bearer ${token}` };

      return this.http.get<User[]>(`${this.apiUrl}/friends/search?q=${query}`, { headers });
    }

    sendFriendRequest(toUserId: string): Observable<{ message: string }> {
      const token = localStorage.getItem('token');
    
      if (!token) {
        console.error("No authentication token found");
        return new Observable();
      }
      
      const headers = { Authorization: `Bearer ${token}` };

      return this.http.post<{ message: string }>(`${this.apiUrl}/friends/send/${toUserId}`, {},
        { headers }
      );
    }

    acceptFriendRequest(fromUserId: string): Observable<{ message: string }> {
      const token = localStorage.getItem('token');
    
      if (!token) {
        console.error("No authentication token found");
        return new Observable();
      }
      
      const headers = { Authorization: `Bearer ${token}` };

      return this.http.post<{ message: string }>(`${this.apiUrl}/friends/accept/${fromUserId}`, {},
        { headers }
      );
    }

    declineFriendRequest(fromUserId: string): Observable<{ message: string }> {
      const token = localStorage.getItem('token');
    
      if (!token) {
        console.error("No authentication token found");
        return new Observable();
      }
      
      const headers = { Authorization: `Bearer ${token}` };

      return this.http.post<{ message: string }>(`${this.apiUrl}/friends/decline/${fromUserId}`, {},
        { headers }
      );
    }

    removeFriend(friendId: string): Observable<{ message: string }> {
      const token = localStorage.getItem('token');
    
      if (!token) {
        console.error("No authentication token found");
        return new Observable();
      }
      
      const headers = { Authorization: `Bearer ${token}` };

      return this.http.post<{ message: string }>(`${this.apiUrl}/friends/unfriend/${friendId}`, {},
        { headers }
      );
    }

    getOtherUserProfileInfo(profileId: string): Observable<any> {
      return this.http.get<any>(`${this.apiUrl}/profile/${profileId}`);
    }
}
