import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environments';

@Injectable({
  providedIn: 'root',
})
export class SpotifyService {
  private apiUrl = environment.spotify;

  constructor(private http: HttpClient) {}

  // Fetch stored album images from backend
  getAlbumImages(): Observable<any> {
    return this.http.get<any>(` ${this.apiUrl}/stored-albums`);
  }
}
