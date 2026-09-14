import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { environment } from 'src/environments/environments';
import { Album } from '../models/responses/album-response';
import { Song } from '../models/responses/song-response';
import { SearchResponse } from '../models/responses/search-response';
import { GetReleasesResponse, MusicCalendarResponse } from '../models/responses/release-response';

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

  // Resolves a bare title+artist (no Deezer ID) to a real Deezer track -
  // used by the soundtrack feature's click-through, never for a whole list.
  resolveTrack(title: string, artist?: string | null): Observable<Song> {
    let params = new HttpParams().set('title', title);
    if (artist) params = params.set('artist', artist);
    return this.http.get<Song>(`${this.apiUrl}/resolve-track`, { params });
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

// Odesli/song.link (the prior provider) deprecated public unauthenticated
// access; Songwhip (the other option) shut down in July 2024 - this now
// builds the link map itself, so it needs the track/album's own identifying
// info instead of just a Deezer URL. See backend's getSmartLink.
getSmartLink(params: {
  type: 'track' | 'album';
  title: string;
  artist: string;
  deezerUrl: string;
  isrc?: string | null;
  upc?: string | null;
}): Observable<any> {
  let httpParams = new HttpParams()
    .set('type', params.type)
    .set('title', params.title)
    .set('artist', params.artist)
    .set('deezerUrl', params.deezerUrl);
  if (params.isrc) httpParams = httpParams.set('isrc', params.isrc);
  if (params.upc) httpParams = httpParams.set('upc', params.upc);

  return this.http.get<any>(`${this.apiUrl}/smartlink`, { params: httpParams });
}

// Music calendar - upcoming/past releases for the current user's followed
// artists, same shape/pagination as CinemaService.getCalendar.
getMusicCalendar(forceRefresh = false, range: 'upcoming' | 'past' = 'upcoming', offset = 0, limit = 20): Observable<MusicCalendarResponse> {
  const token = localStorage.getItem('token');
  const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });

  let params: Record<string, string> = { range, offset: String(offset), limit: String(limit) };
  if (forceRefresh) params = { ...params, refresh: 'true' };

  return this.http.get<MusicCalendarResponse>(`${this.apiUrl}/music-calendar`, { headers, params });
}

}
