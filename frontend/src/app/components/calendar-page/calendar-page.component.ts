import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { NgbModal, NgbModalOptions } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { CalendarEntry } from 'src/app/models/responses/cinema-response';
import { CinemaService } from 'src/app/services/cinema.service';
import { ReviewPageComponent } from '../review-page/review-page.component';

@Component({
  selector: 'app-calendar',
  templateUrl: './calendar-page.component.html',
  styleUrls: ['./calendar-page.component.css'],
  standalone: true,
  imports: [CommonModule],
})
export class CalendarPageComponent implements OnInit {
  entries: CalendarEntry[] = [];
  isLoading = true;
  isRefreshing = false;
  imageLoaded: { [index: number]: boolean } = {};
  range: 'upcoming' | 'past' = 'upcoming';

  constructor(
    private cinemaService: CinemaService,
    private toastr: ToastrService,
    private modal: NgbModal
  ) {}

  ngOnInit(): void {
    this.loadCalendar();
  }

  private loadCalendar(): void {
    this.isLoading = true;
    this.entries = [];
    this.imageLoaded = {};

    this.cinemaService.getCalendar(false, this.range).subscribe({
      next: ({ data }) => {
        this.entries = data;
        this.isLoading = false;
      },
      error: () => {
        this.toastr.error('Error occurred while loading your calendar.', 'Error');
        this.isLoading = false;
      },
    });
  }

  setRange(range: 'upcoming' | 'past'): void {
    if (this.range === range || this.isLoading) return;
    this.range = range;
    this.loadCalendar();
  }

  refresh(): void {
    if (this.isRefreshing) return;
    this.isRefreshing = true;
    this.isLoading = true;
    this.entries = [];
    this.imageLoaded = {};

    this.cinemaService.getCalendar(true, this.range).subscribe({
      next: ({ data }) => {
        this.entries = data;
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

  // "Airs Today" / "In 3 days" / "3 days ago" / "Aug 12" style relative label
  getCountdownLabel(airDate: string): string {
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
    if (diffDays > 1 && diffDays <= 7) return `In ${diffDays} days`;
    if (diffDays < -1 && diffDays >= -7) return `${Math.abs(diffDays)} days ago`;

    return target.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  openEntry(entry: CalendarEntry): void {
    const modalOptions: NgbModalOptions = {
      backdrop: 'static',
      keyboard: true,
      centered: true,
      scrollable: false,
    };

    const modalRef = this.modal.open(ReviewPageComponent, modalOptions);

    const record = {
      type: 'Cinema' as const,
      _id: entry._id,
      user: '',
      mediaType: entry.mediaType,
      tmdbId: entry.tmdbId,
      title: entry.title,
      cover: entry.cover ?? undefined,
      isWatchlist: entry.isWatchlist,
      decimalRating: entry.decimalRating,
      reviewText: entry.reviewText,
      isUnrefinedImport: entry.isUnrefinedImport,
      traktSynced: false,
      createdAt: new Date().toISOString(),
    };

    modalRef.componentInstance.recordList = [record];
    modalRef.componentInstance.currentIndex = 0;
    modalRef.componentInstance.record = record;
  }
}
