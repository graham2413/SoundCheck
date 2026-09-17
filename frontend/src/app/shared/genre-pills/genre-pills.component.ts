import { Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';

// Single reusable presentational row of genre pills - replaces the old
// plain ", "-joined text line everywhere a cinema item's genres are shown
// (detail page, search results, watchlist, similar/recommendations grids).
// 'sm' shrinks padding/text for tight card layouts (grids, list rows);
// default 'md' is sized for the detail page's header.
//
// mode 'wrap' (default) just lets every pill wrap onto as many lines as it
// needs - used where a card's height already grows to fit its content.
// mode 'line' keeps everything on exactly one line, measures how many pills
// actually fit the container's current width, and collapses whatever
// doesn't into a trailing "+N" pill - used everywhere a card's height is
// fixed/content-driven-elsewhere (marquee, Trending grid, similar list) so
// a title with more genres than another doesn't stretch its card taller.
// `expandable` (only meaningful with mode 'line') lets that "+N" pill be
// clicked to reveal the rest in place - used on the detail page's own
// header, the one 'line' spot where "show everything" is a reasonable ask.
@Component({
  selector: 'app-genre-pills',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      #container
      *ngIf="genres?.length"
      class="genre-pills"
      [ngClass]="['genre-pills--' + size, mode === 'line' ? 'genre-pills--line' : '', mode === 'line' && !measured ? 'genre-pills--measuring' : '']"
    >
      <span *ngFor="let genre of displayedGenres" class="genre-pill">{{ genre }}</span>
      <span
        *ngIf="mode === 'line' && hiddenCount > 0"
        class="genre-pill genre-pill--more"
        [class.genre-pill--clickable]="expandable"
        (click)="onMoreClick()"
      >+{{ hiddenCount }}</span>
    </div>
  `,
  styleUrls: ['./genre-pills.component.css'],
})
export class GenrePillsComponent implements OnChanges, OnDestroy {
  @Input() genres: string[] | null | undefined;
  @Input() size: 'sm' | 'md' = 'md';
  @Input() mode: 'wrap' | 'line' = 'wrap';
  @Input() expandable = false;

  @ViewChild('container') containerRef?: ElementRef<HTMLDivElement>;

  displayedGenres: string[] = [];
  hiddenCount = 0;
  // Starts true so 'wrap' mode (no measuring at all) never shows the
  // "measuring" placeholder state - set false only while 'line' mode's
  // first measurement of a given genre list is still pending.
  measured = true;
  private isExpanded = false;

  private resizeObserver?: ResizeObserver;
  private pendingFrame?: number;

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['genres'] && !changes['mode']) return;

    this.isExpanded = false;
    this.hiddenCount = 0;
    this.displayedGenres = this.genres ?? [];

    if (this.mode !== 'line') {
      this.measured = true;
      this.stopObserving();
      return;
    }

    this.measured = false;
    this.scheduleMeasure();
  }

  ngOnDestroy(): void {
    this.stopObserving();
    if (this.pendingFrame !== undefined) cancelAnimationFrame(this.pendingFrame);
  }

  onMoreClick(): void {
    if (!this.expandable || this.isExpanded) return;
    this.isExpanded = true;
    this.hiddenCount = 0;
    this.displayedGenres = this.genres ?? [];
  }

  private scheduleMeasure(): void {
    // Angular hasn't painted displayedGenres yet at the point this is
    // called from - wait a frame so the DOM actually has one pill per
    // genre to measure.
    if (this.pendingFrame !== undefined) cancelAnimationFrame(this.pendingFrame);
    this.pendingFrame = requestAnimationFrame(() => {
      this.pendingFrame = undefined;
      this.measure();
      if (!this.resizeObserver && this.containerRef) {
        // A card resizing (orientation change, sidebar toggle, etc.) can
        // change how many pills fit - re-measure when that happens rather
        // than only ever on the initial @Input push.
        this.resizeObserver = new ResizeObserver(() => this.remeasureFromFull());
        this.resizeObserver.observe(this.containerRef.nativeElement);
      }
    });
  }

  // A resize has to be judged against every genre's real width, not
  // whatever trimmed subset a PREVIOUS measurement happened to leave
  // visible - re-expand first, then measure that.
  private remeasureFromFull(): void {
    if (this.isExpanded) return; // already showing everything, nothing to recompute
    this.displayedGenres = this.genres ?? [];
    this.scheduleMeasure();
  }

  private stopObserving(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
  }

  private measure(): void {
    const container = this.containerRef?.nativeElement;
    const total = this.genres?.length ?? 0;
    if (this.isExpanded || !container || !total) {
      this.measured = true;
      return;
    }

    const pills = Array.from(container.querySelectorAll<HTMLElement>('.genre-pill:not(.genre-pill--more)'));
    if (pills.length !== total) {
      // displayedGenres hasn't rendered as the full one-pill-per-genre set
      // yet - retry next frame instead of measuring a stale/partial one.
      this.scheduleMeasure();
      return;
    }

    const containerWidth = container.clientWidth;
    // Reserved so a trailing "+N" pill (added in a second pass below) has
    // room to land without immediately pushing itself past the edge too -
    // sized generously (worst case ~2-digit count) rather than measured
    // exactly, so this stays a single fast pass instead of a
    // render-measure-render-measure loop.
    const moreReserve = this.size === 'sm' ? 44 : 56;

    let fitCount = total;
    for (let i = 0; i < pills.length; i++) {
      const right = pills[i].offsetLeft + pills[i].offsetWidth;
      const isLastPill = i === total - 1;
      const budget = isLastPill ? containerWidth : containerWidth - moreReserve;
      if (right > budget) {
        fitCount = i;
        break;
      }
    }
    fitCount = Math.max(fitCount, 1); // always show at least one genre

    this.hiddenCount = total - fitCount;
    this.displayedGenres = this.hiddenCount > 0 ? this.genres!.slice(0, fitCount) : this.genres!;
    this.measured = true;
  }
}
