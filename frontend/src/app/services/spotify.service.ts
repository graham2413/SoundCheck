import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environments';
import { AlbumImagesResponse } from '../models/responses/album-images-response';

@Injectable({
  providedIn: 'root',
})
export class SpotifyService {
  private apiUrl = environment.spotify;

  constructor(private http: HttpClient) {}

  // Fetch stored album images from backend
  getAlbumImages(): Observable<AlbumImagesResponse> {
    return this.http.get<AlbumImagesResponse>(`${this.apiUrl}/stored-albums`);
  }
}
