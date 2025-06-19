import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { environment } from 'src/environments/environments';
import { Album } from '../models/responses/album-response';
import { Song } from '../models/responses/song-response';
import { SearchResponse } from '../models/responses/search-response';
import { GetReleasesResponse } from '../models/responses/release-response';

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

  syncArtistAlbums(artistId: string, artistName: string): Observable<any> {
    const token = localStorage.getItem('token');

    if (!token) {
      console.error('No authentication token found');
      return throwError(() => new Error('No auth token'));
    }

    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    });

    return this.http.post(`${this.apiUrl}/artist/${artistId}/sync?name=${encodeURIComponent(artistName)}`,
      {},
      { headers }
    );
  }

getReleasesByArtistIds(
  artistIds: string[],
  limit: number,
  cursorDate?: string,
  cursorId?: string
): Observable<GetReleasesResponse> {
  
  let params = new HttpParams().set('limit', limit.toString());

  if (cursorDate) {
    params = params.set('cursorDate', cursorDate);
  }
  if (cursorId) {
    params = params.set('cursorId', cursorId);
  }

  return this.http.post<GetReleasesResponse>(
    `${this.apiUrl}/artist/releases`,
    { artistIds },
    { params }
  );
}

getArtistReleases(artistId: number, artistName: string): Observable<{ albums: Album[]; next: string | null }> {
  const params = new HttpParams()
    .set('artistName', artistName);

  return this.http.get<{ albums: Album[]; next: string | null }>(
    `${this.apiUrl}/artists/${artistId}/releases`,
    { params }
  );
}

}
