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
// clicked to reveal the rest in place, and (once expanded) clicked again
// anywhere in the row to collapse back - used on the detail page's own
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
      [ngClass]="[
        'genre-pills--' + size,
        mode === 'line' && !isExpanded ? 'genre-pills--line' : '',
        expandable && isExpanded ? 'genre-pills--clickable' : ''
      ]"
      (click)="onContainerClick()"
    >
      <span
        *ngFor="let genre of displayedGenres; let i = index"
        class="genre-pill"
        [class.genre-pill--truncate]="i === truncatedPillIndex"
      >{{ genre }}</span>
      <span
        *ngIf="mode === 'line' && hiddenCount > 0"
        class="genre-pill genre-pill--more"
        [class.genre-pill--clickable]="expandable"
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
  // Index (within displayedGenres) of the one pill, if any, measure() let
  // onto the line at less than its natural width - lets that pill
  // shrink/ellipsize via CSS instead of silently clipping mid-word. Every
  // other displayed pill genuinely fits at full width.
  truncatedPillIndex: number | null = null;
  isExpanded = false;

  private resizeObserver?: ResizeObserver;
  private pendingFrame?: number;
  // Bounds measure()'s self-correction below - never loops forever.
  private verifyAttempts = 0;

  constructor() {
    // The app loads Roboto via Google Fonts with display=swap - text
    // renders in a fallback font immediately, then swaps to Roboto once it
    // loads. If measure() runs before that swap (likely on a fresh page
    // load), it reads pill widths in the fallback font's metrics; once the
    // real font swaps in, those widths can be wrong (e.g. a genre that
    // "fit" no longer does) with nothing otherwise triggering a re-check.
    document.fonts?.ready.then(() => {
      if (this.mode === 'line' && !this.isExpanded) this.scheduleMeasure();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['genres'] && !changes['mode']) return;

    this.isExpanded = false;
    this.hiddenCount = 0;
    this.truncatedPillIndex = null;
    this.verifyAttempts = 0;

    if (this.mode !== 'line') {
      this.displayedGenres = this.genres ?? [];
      this.stopObserving();
      return;
    }

    // Left empty (not the full list) until scheduleMeasure() below decides
    // the actually-fitting subset - genre widths are read via detached
    // probes (see measure()), not by rendering the full list and reading
    // it back, so there's never a wrong/untrimmed set on screen to flash
    // before the real one replaces it.
    this.displayedGenres = [];
    this.scheduleMeasure();
  }

  ngOnDestroy(): void {
    this.stopObserving();
    if (this.pendingFrame !== undefined) cancelAnimationFrame(this.pendingFrame);
  }

  onContainerClick(): void {
    if (!this.expandable) return;
    if (this.isExpanded) {
      this.isExpanded = false;
      // Cleared immediately (not left as the full list) so collapsing
      // doesn't flash every genre pill, harshly clipped by nowrap/overflow
      // for a frame, before the next measure() trims it properly.
      this.displayedGenres = [];
      this.hiddenCount = 0;
      this.truncatedPillIndex = null;
      this.verifyAttempts = 0;
      this.scheduleMeasure();
    } else if (this.hiddenCount > 0) {
      this.isExpanded = true;
      this.hiddenCount = 0;
      this.truncatedPillIndex = null;
      this.displayedGenres = this.genres ?? [];
      this.stopObserving(); // wrapped/expanded height isn't what 'line' mode measures against
    }
  }

  private scheduleMeasure(): void {
    // Angular needs a frame to mount #container before it can be measured.
    if (this.pendingFrame !== undefined) cancelAnimationFrame(this.pendingFrame);
    this.pendingFrame = requestAnimationFrame(() => {
      this.pendingFrame = undefined;
      this.measure();
      this.scheduleVerify();
      if (!this.resizeObserver && this.containerRef) {
        // A card resizing (orientation change, sidebar toggle, etc.) can
        // change how many pills fit - re-measure when that happens rather
        // than only ever on the initial @Input push. (This also fires once
        // immediately just from calling observe() - measure() re-probing
        // from scratch each time, rather than trusting whatever subset is
        // currently displayed, makes that harmless.)
        this.resizeObserver = new ResizeObserver(() => {
          if (!this.isExpanded) this.scheduleMeasure();
        });
        this.resizeObserver.observe(this.containerRef.nativeElement);
      }
    });
  }

  private stopObserving(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
  }

  // Confirms measure()'s decision against the REAL rendered pills one
  // frame later, and re-measures (fresh probes) if it doesn't actually
  // fit - a safety net for anything that could make a probe's width not
  // match the real pill it stands in for (e.g. a web font or stylesheet
  // still settling when the probe was read). Bounded by verifyAttempts so
  // a container that genuinely never fits doesn't loop forever.
  private scheduleVerify(): void {
    if (this.pendingFrame !== undefined) cancelAnimationFrame(this.pendingFrame);
    this.pendingFrame = requestAnimationFrame(() => {
      this.pendingFrame = undefined;
      this.verify();
    });
  }

  private verify(): void {
    const container = this.containerRef?.nativeElement;
    if (this.isExpanded || !container || this.mode !== 'line') return;

    const more = container.querySelector<HTMLElement>('.genre-pill--more');
    const pills = container.querySelectorAll<HTMLElement>('.genre-pill:not(.genre-pill--more)');
    const lastEl = more ?? pills[pills.length - 1];
    if (!lastEl) return;

    const overflowing = lastEl.offsetLeft + lastEl.offsetWidth > container.clientWidth;
    if (!overflowing || this.verifyAttempts >= 3) return;

    this.verifyAttempts++;
    this.measure();
    this.scheduleVerify();
  }

  // Figures out how many genres actually fit the container's current
  // width without ever rendering the full, untrimmed list to find out -
  // every width it needs (each genre pill, the "+N" pill) is read from a
  // single reusable, hidden, absolutely-positioned probe element measured
  // and removed synchronously in this one pass, so the DOM only ever shows
  // the final, correct, already-trimmed set.
  private measure(): void {
    const container = this.containerRef?.nativeElement;
    const total = this.genres?.length ?? 0;
    if (this.isExpanded || !container || !total) {
      return;
    }

    const containerWidth = container.clientWidth;
    const GAP = 8; // .genre-pills { gap: 0.5rem }

    const probe = document.createElement('span');
    probe.className = 'genre-pill';
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    // Angular's emulated view encapsulation scopes this component's CSS to
    // elements carrying its auto-generated _ngcontent-* attribute, which is
    // only ever stamped onto elements declared in the template - a raw
    // document.createElement span doesn't get one, so without copying it
    // from a real element none of .genre-pill's styling would apply and
    // this would measure browser-default (~16px, unstyled) text instead of
    // the real pill's font/padding, systematically undersizing every width.
    for (const attr of Array.from(container.attributes)) {
      if (attr.name.startsWith('_ngcontent')) probe.setAttribute(attr.name, attr.value);
    }
    container.appendChild(probe);

    const widths = this.genres!.map((genre) => {
      probe.textContent = genre;
      return probe.offsetWidth;
    });

    // N only ranges 1..total-1 and its width barely changes across that
    // range, so probing with the largest possible value is accurate
    // enough for any actual count within it.
    probe.className = 'genre-pill genre-pill--more';
    probe.textContent = '+' + Math.max(total - 1, 1);
    const moreWidth = probe.offsetWidth;
    container.removeChild(probe);

    const naturalTotalWidth = widths.reduce((sum, w) => sum + w, 0) + GAP * (total - 1);
    if (naturalTotalWidth <= containerWidth) {
      this.hiddenCount = 0;
      this.truncatedPillIndex = null;
      this.displayedGenres = this.genres!;
      return;
    }

    // Reserves 2 gaps, not 1: if a truncated pill ends up inserted between
    // the last full pill and "+N", that's a gap on both sides of it.
    // SAFETY_PX absorbs sub-pixel layout rounding (offsetWidth rounds to
    // whole pixels, and small rounding errors can compound across pills).
    const SAFETY_PX = 6;
    const budget = containerWidth - moreWidth - GAP * 2 - SAFETY_PX;

    // How many pills fit at their full natural width within budget.
    let right = 0;
    let fitCount = 0;
    while (fitCount < total) {
      const nextRight = right + (fitCount > 0 ? GAP : 0) + widths[fitCount];
      if (nextRight > budget) break;
      right = nextRight;
      fitCount++;
    }

    // Rather than jumping straight to "+N" after the last full pill,
    // squeeze in a truncated/ellipsized sliver of the next genre if
    // there's enough leftover budget for it to read as a genre rather
    // than a meaningless fragment - maximizes how much of the line's
    // width is actually used.
    const minTruncatedWidth = this.size === 'sm' ? 28 : 34;
    let truncatedIndex: number | null = null;
    if (fitCount < total) {
      const nextStart = right + (fitCount > 0 ? GAP : 0);
      if (budget - nextStart >= minTruncatedWidth) truncatedIndex = fitCount;
    }

    let shownCount = fitCount + (truncatedIndex !== null ? 1 : 0);
    if (shownCount === 0) {
      // Always show at least one genre, even if it has to truncate below
      // minTruncatedWidth to do it.
      shownCount = 1;
      truncatedIndex = 0;
    }

    this.hiddenCount = total - shownCount;
    this.truncatedPillIndex = truncatedIndex;
    this.displayedGenres = this.genres!.slice(0, shownCount);
  }
}
