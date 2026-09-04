import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { InfiniteScrollDirective } from 'ngx-infinite-scroll';
import { CinemaItem } from 'src/app/models/responses/cinema-response';

// Presentational watchlist list (mirrors the calendar page's row layout) -
// purely renders/paginates whatever list it's given. All data-fetching and
// cross-list syncing (e.g. rating an item also affects the separate reviews
// list) stays owned by the parent for now; this only owns row rendering and
// per-row image-load state.
@Component({
  selector: 'app-cinema-watchlist',
  standalone: true,
  imports: [CommonModule, InfiniteScrollDirective],
  templateUrl: './cinema-watchlist.component.html',
  styleUrl: './cinema-watchlist.component.css',
})
export class CinemaWatchlistComponent {
  @Input() items: CinemaItem[] = [];
  @Input() isLoading = false;
  @Input() isFetchingMore = false;
  @Input() scrollContainer: HTMLElement | null = null;

  @Output() itemClicked = new EventEmitter<{ item: CinemaItem; list: CinemaItem[]; index: number }>();
  @Output() loadMore = new EventEmitter<void>();

  private imageLoaded: { [index: number]: boolean } = {};

  onItemClick(item: CinemaItem, index: number): void {
    this.itemClicked.emit({ item, list: this.items, index });
  }

  markImageLoaded(i: number): void {
    this.imageLoaded[i] = true;
  }

  isImageLoaded(i: number): boolean {
    return this.imageLoaded[i] === true;
  }

  // Small poster-sized thumbnail instead of the full-res cover, for the watchlist list.
  // Returns null (no image element rendered) when there's no cover, instead of
  // falling back to the shared music-themed placeholder image, which looked
  // wrong for movies/shows - see the icon-based placeholder in the template.
  getThumbUrl(cover: string | undefined | null): string | null {
    if (!cover) return null;
    return cover.includes('/upload/')
      ? cover.replace('/upload/', '/upload/w_300,h_450,c_fill,f_auto,q_auto/')
      : cover;
  }
}
