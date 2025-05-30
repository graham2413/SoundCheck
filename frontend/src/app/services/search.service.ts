import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environments';
import { Album } from '../models/responses/album-response';
import { Song } from '../models/responses/song-response';
import { SearchResponse } from '../models/responses/search-response';

@Injectable({
  providedIn: 'root'
})
export class SearchService {
    private apiUrl = environment.search;

  constructor(private http: HttpClient) {}

  searchMusic(query: string, type: 'songs' | 'albums' | 'artists' | 'all' = 'songs'): Observable<SearchResponse> {
    const url = `${this.apiUrl}?query=${encodeURIComponent(query)}&type=${type}`;
    return this.http.get<SearchResponse>(url);
  }

  getTrackDetails(trackId: number): Observable<Song> {
    return this.http.get<Song>(`${this.apiUrl}/track/${trackId}`);
  }

  getAlbumDetails(albumId: number): Observable<Album> {
    return this.http.get<Album>(`${this.apiUrl}/album/${albumId}`);
  }

  getArtistTracks(artistId: number): Observable<Song[]> {
    return this.http.get<Song[]>(`${this.apiUrl}/artistTracks/${artistId}`);
  }
}
