import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { env } from 'src/env';

@Injectable({
  providedIn: 'root'
})
export class SearchService {
    private apiUrl = env.searchurl;

  constructor(private http: HttpClient) {}

  searchMusic(query: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}?query=${encodeURIComponent(query)}`);
  }
}
