import { Component } from '@angular/core';
import { SearchService } from 'src/app/services/search.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
})
export class HomeComponent {
  query: string = '';
  results: any = null;
  isLoading: boolean = false;
  errorMessage: string = '';
  activeTab: 'songs' | 'albums' | 'artists' = 'songs';

  constructor(private searchService: SearchService) {}

  onSearch() {
    if (!this.query.trim()) return;
    this.isLoading = true;
    this.errorMessage = '';

    this.searchService.searchMusic(this.query).subscribe({
      next: (data) => {
        this.results = data;
        this.setActiveTab('songs');
        this.isLoading = false;
      },
      error: (error) => {
        this.errorMessage = 'Failed to fetch results. Try again.';
        console.error('Search Error:', error);
        this.isLoading = false;
      }
    });
  }

  setActiveTab(tab: 'songs' | 'albums' | 'artists') {
    this.activeTab = tab;
  }

}
