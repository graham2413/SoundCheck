import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SearchService {
    private apiUrl = environment.api.search;

  constructor(private http: HttpClient) {}

  searchMusic(query: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}?query=${encodeURIComponent(query)}`);
  }
}
