import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { animate, animateChild, query, stagger, style, transition, trigger } from '@angular/animations';
import { NgbModal, NgbModalOptions, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { InfiniteScrollDirective } from 'ngx-infinite-scroll';
import { CalendarEntry, CalendarSubtitle, CalendarMonthGroup } from 'src/app/models/responses/cinema-response';
import { CinemaItem } from 'src/app/models/responses/cinema-response';
import { MusicCalendarEntry } from 'src/app/models/responses/release-response';
import { CinemaService } from 'src/app/services/cinema.service';
import { SearchService } from 'src/app/services/search.service';
import { CinemaReviewModalComponent } from '../cinema-review-page/cinema-review-modal.component';
import { CinemaRateModalComponent } from '../cinema-review-page/cinema-rate-modal.component';
import { ReviewPageComponent } from '../review-page/review-page.component';
import { FilmCameraIconComponent } from 'src/app/shared/film-camera-icon/film-camera-icon.component';

// Both entry shapes share _id/airDate/cover/title (everything the shared
// month/day grouping and the row shell need) - `kind` alone decides which
// per-row detail block renders and what a click on it does.
type CalendarKind = 'cinema' | 'music';
type CombinedEntry = CalendarEntry | MusicCalendarEntry;

@Component({
  selector: 'app-calendar',
  templateUrl: './calendar-page.component.html',
  styleUrls: ['./calendar-page.component.css'],
  standalone: true,
  imports: [CommonModule, InfiniteScrollDirective, FilmCameraIconComponent],
  animations: [
    // Container - staggers each row's own @entryAnim as they enter, so the
    // list reveals top-down instead of popping in all at once.
    trigger('listAnim', [
      transition(':enter', [
        query('@entryAnim', [stagger(50, animateChild())], { optional: true }),
      ]),
    ]),
    trigger('entryAnim', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-16px)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0)' })),
      ]),
    ]),
  ],
})
export class CalendarPageComponent implements OnInit {
  kind: CalendarKind = 'cinema';
  entries: CombinedEntry[] = [];
  isLoading = true;
  isRefreshing = false;
  imageLoaded: { [id: string]: boolean } = {};
  range: 'upcoming' | 'past' = 'upcoming';
  mediaTypeFilter: 'all' | 'movie' | 'tv' = 'all';
  subtitle: CalendarSubtitle | null = null;
  monthGroups: CalendarMonthGroup[] = [];

  get pageTitle(): string {
    return this.kind === 'music' ? 'Music Calendar' : 'Cinema Calendar';
  }

  // Type guard so the template can branch per-row rendering/click behavior
  // without either entry shape needing a redundant explicit "kind" field of
  // its own from the backend.
  isMusicEntry(entry: CombinedEntry): entry is MusicCalendarEntry {
    return this.kind === 'music';
  }

  // Deezer/Spotify's own record_type/album_type ("album"/"single"/"ep"/
  // "compile"/"compilation") - null for past rows synced before this field
  // was captured, so those show a generic label instead of a guessed one.
  musicTypeLabel(entry: MusicCalendarEntry): string {
    switch (entry.recordType) {
      case 'single':
        return 'Single';
      case 'ep':
        return 'EP';
      case 'compile':
      case 'compilation':
        return 'Compilation';
      case 'album':
        return 'Album';
      default:
        return 'Release';
    }
  }

  // Pagination - the full list can be large (a big watchlist), and
  // rendering/animating/loading every entry's image at once was what made
  // opening a big calendar feel sluggish on mobile. Loads PAGE_SIZE at a
  // time, more fetched as the user scrolls near the bottom (see loadMore).
  private static readonly PAGE_SIZE = 20;
  private offset = 0;
  hasMore = false;
  isLoadingMore = false;

  get rangeTabIndex(): number {
    return this.range === 'upcoming' ? 0 : 1;
  }

  // "Next 7 days · 4 releases" style label - direction word flips with range
  // ('Next' for upcoming, 'Previous' for past), magnitude comes from the
  // matched cascade tier; 'all' fallback has no magnitude to show, so it
  // just reads "Upcoming"/"Recent" instead. See buildCalendarSubtitle in
  // cinemaController.js for the cascade itself.
  get subtitleLabel(): string {
    if (!this.subtitle) return '';
    const { count, period } = this.subtitle;
    const noun = count === 1 ? 'release' : 'releases';
    const direction = this.range === 'upcoming' ? 'Next' : 'Previous';
    const magnitudes: Record<CalendarSubtitle['period'], string> = {
      'this-week': '7 days',
      'next-week': '2 weeks',
      'last-week': '2 weeks',
      'this-month': '1 month',
      'this-year': '1 year',
      all: '',
    };
    const magnitude = magnitudes[period];
    const periodLabel = magnitude ? `${direction} ${magnitude}` : this.range === 'upcoming' ? 'Upcoming' : 'Recent';
    return `${periodLabel} \u00b7 ${count} ${noun}`;
  }

  // Groups the currently-loaded entries by month for the section headers -
  // each group's count comes from monthGroups (the TRUE total for that
  // month, computed server-side over the full list), not how many of that
  // month happen to have paged in so far.
  get groupedEntries(): {
    key: string;
    label: string;
    count: number;
    dayGroups: { label: string; count: number; items: CombinedEntry[] }[];
  }[] {
    const order: string[] = [];
    const byKey = new Map<string, CombinedEntry[]>();
    for (const entry of this.entries) {
      const key = entry.airDate.slice(0, 7);
      if (!byKey.has(key)) {
        byKey.set(key, []);
        order.push(key);
      }
      byKey.get(key)!.push(entry);
    }
    return order.map((key) => {
      const meta = this.monthGroups.find((g) => g.key === key);
      const items = byKey.get(key)!;
      return { key, label: meta?.label ?? key, count: meta?.count ?? items.length, dayGroups: this.groupByDay(items) };
    });
  }

  // Sub-groups a month's (already-loaded) items by day label ("Today"/"In N
  // days"/etc) - unlike month counts, these counts are just of what's
  // currently loaded, not a true independent total, since days are a much
  // finer granularity than the 20-item page size and a real mismatch here
  // would be rare/momentary (resolves itself once the next page loads).
  private groupByDay(items: CombinedEntry[]): { label: string; count: number; items: CombinedEntry[] }[] {
    const order: string[] = [];
    const byLabel = new Map<string, CombinedEntry[]>();
    for (const entry of items) {
      const label = this.getDayGroupLabel(entry.airDate);
      if (!byLabel.has(label)) {
        byLabel.set(label, []);
        order.push(label);
      }
      byLabel.get(label)!.push(entry);
    }
    return order.map((label) => {
      const dayItems = byLabel.get(label)!;
      return { label, count: dayItems.length, items: dayItems };
    });
  }

  // trackBy for both *ngFor loops over groupedEntries/group.items - without
  // these, the getter above returning fresh objects every change-detection
  // cycle makes Angular treat each group/entry as newly added every time,
  // tearing down and recreating the DOM (and restarting/interrupting the
  // @entryAnim enter animation) constantly instead of just once.
  trackByGroupKey(_index: number, group: { key: string }): string {
    return group.key;
  }

  trackByEntryId(_index: number, entry: CombinedEntry): string {
    return entry._id;
  }

  trackByDayLabel(_index: number, dayGroup: { label: string }): string {
    return dayGroup.label;
  }

  constructor(
    private cinemaService: CinemaService,
    private searchService: SearchService,
    private toastr: ToastrService,
    private modal: NgbModal,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    const query = this.route.snapshot.queryParamMap;
    const requestedKind = query.get('kind');
    const requestedRange = query.get('range');
    if (requestedKind === 'music' || requestedKind === 'cinema') this.kind = requestedKind;
    if (requestedRange === 'past' || requestedRange === 'upcoming') this.range = requestedRange;
    this.loadCalendar();
  }

  // Single branch point between the two backends - everything else
  // (pagination, subtitle/month-group state, loading flags) is identical
  // either way since both endpoints share the exact same response shape.
  // Explicit return type + cast: TS can't unify Observable<A>|Observable<B>
  // into a single callable .subscribe() overload set on its own.
  private fetchPage(
    forceRefresh: boolean,
    offset: number
  ): Observable<{ data: CombinedEntry[]; hasMore: boolean; total: number; subtitle: CalendarSubtitle; monthGroups: CalendarMonthGroup[] }> {
    const obs$ =
      this.kind === 'music'
        ? this.searchService.getMusicCalendar(forceRefresh, this.range, offset, CalendarPageComponent.PAGE_SIZE)
        : this.cinemaService.getCalendar(forceRefresh, this.range, offset, CalendarPageComponent.PAGE_SIZE, this.mediaTypeFilter);
    return obs$ as unknown as Observable<{
      data: CombinedEntry[];
      hasMore: boolean;
      total: number;
      subtitle: CalendarSubtitle;
      monthGroups: CalendarMonthGroup[];
    }>;
  }

  private loadCalendar(): void {
    this.isLoading = true;
    this.entries = [];
    this.imageLoaded = {};
    this.offset = 0;
    this.hasMore = false;

    this.fetchPage(false, 0).subscribe({
      next: ({ data, hasMore, subtitle, monthGroups }) => {
        this.entries = data;
        this.hasMore = hasMore;
        this.offset = data.length;
        this.subtitle = subtitle;
        this.monthGroups = monthGroups;
        this.isLoading = false;
      },
      error: () => {
        this.toastr.error('Error occurred while loading your calendar.', 'Error');
        this.isLoading = false;
      },
    });
  }

  // Fired by infiniteScroll on the entries list - appends the next page
  // instead of replacing entries, so scroll position/animations aren't disturbed.
  loadMore(): void {
    if (this.isLoading || this.isLoadingMore || !this.hasMore) return;
    this.isLoadingMore = true;

    this.fetchPage(false, this.offset).subscribe({
      next: ({ data, hasMore, subtitle, monthGroups }) => {
        this.entries = [...this.entries, ...data];
        this.hasMore = hasMore;
        this.offset += data.length;
        this.subtitle = subtitle;
        this.monthGroups = monthGroups;
        this.isLoadingMore = false;
      },
      error: () => {
        this.toastr.error('Error occurred while loading more of your calendar.', 'Error');
        this.isLoadingMore = false;
      },
    });
  }

  setRange(range: 'upcoming' | 'past'): void {
    if (this.range === range || this.isLoading) return;
    this.range = range;
    this.loadCalendar();
  }

  setMediaTypeFilter(mediaType: 'all' | 'movie' | 'tv'): void {
    if (this.mediaTypeFilter === mediaType || this.isLoading) return;
    this.mediaTypeFilter = mediaType;
    this.loadCalendar();
  }

  setKind(kind: CalendarKind): void {
    if (this.kind === kind || this.isLoading) return;
    this.kind = kind;
    this.range = kind === 'music' ? 'past' : 'upcoming';
    this.loadCalendar();
  }

  refresh(): void {
    if (this.isRefreshing) return;
    this.isRefreshing = true;
    this.isLoading = true;
    this.entries = [];
    this.imageLoaded = {};
    this.offset = 0;
    this.hasMore = false;

    this.fetchPage(true, 0).subscribe({
      next: ({ data, hasMore, subtitle, monthGroups }) => {
        this.entries = data;
        this.hasMore = hasMore;
        this.offset = data.length;
        this.subtitle = subtitle;
        this.monthGroups = monthGroups;
        this.isRefreshing = false;
        this.isLoading = false;
        this.toastr.success('Calendar refreshed.', 'Success');
      },
      error: () => {
        this.toastr.error('Error occurred while refreshing your calendar.', 'Error');
        this.isRefreshing = false;
        this.isLoading = false;
      },
    });
  }

  // "Today" / "Tomorrow" / "Yesterday" / "In N days" / "N days ago" - used
  // for the day-group sub-headers within each month (see groupedEntries).
  // Unlike the old per-card countdown text this replaced, there's no
  // fallback to an absolute date past 7 days - the mockup keeps using
  // "In N days" arbitrarily far out for these headers, and the actual date
  // is shown on each card itself now instead (see formatFullDate).
  getDayGroupLabel(airDate: string): string {
    const now = new Date();
    // airDate is a date-only string (e.g. "2026-09-04") - parsing it directly
    // with `new Date()` treats it as UTC midnight, which shifts a day back in
    // timezones behind UTC once read back via local getters. Parse the parts
    // manually so it's built as a local calendar date instead.
    const [year, month, day] = airDate.slice(0, 10).split('-').map(Number);
    const target = new Date(year, month - 1, day);

    const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate());
    const diffDays = Math.round(
      (startOfTarget.getTime() - startOfNow.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';
    if (diffDays > 1) return `In ${diffDays} days`;
    return `${Math.abs(diffDays)} days ago`;
  }

  // Full release date shown on each card now (replaces the old relative
  // countdown text there) - e.g. "Fri, Nov 8, 2024". No time-of-day shown:
  // TMDb's episode air_date is date-only, there's no air-time data available
  // anywhere in this app's sources to show something like "8:00 PM".
  formatFullDate(airDate: string): string {
    const [year, month, day] = airDate.slice(0, 10).split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }

  openEntry(entry: CombinedEntry): void {
    if (this.isMusicEntry(entry)) {
      this.openMusicEntry(entry);
      return;
    }
    this.openCinemaEntry(entry as CalendarEntry);
  }

  // Opens the release as an Album, the same way the (now-removed) Release
  // Tracker feed used to (see transformReleaseToModalRecord in
  // main-search.component.ts) - existing review/song-review flow, no changes
  // needed there.
  private openMusicEntry(entry: MusicCalendarEntry): void {
    const modalOptions: NgbModalOptions = {
      backdrop: 'static',
      keyboard: true,
      centered: true,
      scrollable: false,
    };

    const record = {
      id: Number(entry.albumId),
      type: 'Album' as const,
      title: entry.title,
      artist: entry.artistName,
      cover: entry.cover,
      isExplicit: entry.isExplicit,
      releaseDate: entry.airDate,
      avgRating: 0,
      reviewCount: 0,
    };

    const modalRef = this.modal.open(ReviewPageComponent, modalOptions);
    modalRef.componentInstance.record = record;
    modalRef.componentInstance.recordList = [record];
    modalRef.componentInstance.currentIndex = 0;
  }

  private openCinemaEntry(entry: CalendarEntry): void {
    const modalOptions: NgbModalOptions = {
      backdrop: 'static',
      keyboard: true,
      centered: true,
      scrollable: false,
    };

    const record: CinemaItem = {
      type: 'Cinema',
      _id: entry._id,
      user: '',
      mediaType: entry.mediaType,
      tmdbId: entry.tmdbId,
      title: entry.title,
      cover: entry.cover ?? undefined,
      isWatchlist: entry.isWatchlist,
      isWatched: entry.isWatched ?? false,
      decimalRating: entry.decimalRating,
      reviewText: entry.reviewText,
      isUnrefinedImport: entry.isUnrefinedImport,
      traktSynced: false,
      createdAt: new Date().toISOString(),
    };

    const modalRef = this.modal.open(CinemaReviewModalComponent, modalOptions);
    modalRef.componentInstance.record = record;
    modalRef.componentInstance.recordList = [record];
    modalRef.componentInstance.currentIndex = 0;

    modalRef.componentInstance.rate.subscribe((updatedRecord: CinemaItem) => {
      this.openRatingModal(updatedRecord, modalRef);
    });

    // Rating/watchlist changes can move an entry between the Upcoming/Past
    // tabs (or off the calendar entirely), so just reload from the server
    // instead of trying to patch the local list in place.
    modalRef.componentInstance.watchlistToggled?.subscribe(() => this.loadCalendar());
  }

  private openRatingModal(record: CinemaItem, detailsModalRef?: NgbModalRef): void {
    const modalOptions: NgbModalOptions = {
      backdrop: 'static',
      keyboard: true,
      centered: true,
      scrollable: false,
    };

    const modalRef = this.modal.open(CinemaRateModalComponent, modalOptions);
    const instance = modalRef.componentInstance;
    instance.mode = 'cinema';
    instance.tmdbId = record.tmdbId ?? '';
    instance.mediaType = record.mediaType;
    instance.itemTitle = record.title;
    instance.cover = record.cover ?? null;
    instance.displayTitle = record.title;
    instance.typeLabel = record.mediaType === 'movie' ? 'Movie' : 'TV Show';
    instance.initialRating = record.decimalRating ?? null;
    instance.initialReviewText = record.reviewText ?? '';
    instance.initialContainsSpoilers = record.containsSpoilers ?? false;

    // Rating/watchlist changes can move an entry between the Upcoming/Past
    // tabs (or off the calendar entirely), so just reload from the server
    // instead of trying to patch the local list in place.
    modalRef.result.then(
      () => {
        this.loadCalendar();
        detailsModalRef?.componentInstance.refreshAfterRating();
      },
      () => {}
    );
  }
}
