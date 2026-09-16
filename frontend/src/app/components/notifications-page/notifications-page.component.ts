import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { NgbModal, NgbModalOptions } from '@ng-bootstrap/ng-bootstrap';
import { AppNotification, NotificationPreferences, NotificationService } from 'src/app/services/notification.service';
import { ToastrService } from 'ngx-toastr';
import { CinemaItem } from 'src/app/models/responses/cinema-response';
import { CinemaReviewModalComponent } from '../cinema-review-page/cinema-review-modal.component';
import { ReviewPageComponent } from '../review-page/review-page.component';
import { UserService } from 'src/app/services/user.service';
import { TimeAgoPipe } from 'src/app/shared/timeAgo/time-ago.pipe';
import { animate, animateChild, query, stagger, style, transition, trigger } from '@angular/animations';

type NotificationFilter = 'all' | 'movies' | 'tv' | 'music';

// Generic cover fallback (same asset used across profile/review pages when a
// record has no image of its own) - used for the rare notification whose
// details never carried a cover (e.g. one created before `cover` was added).
const FALLBACK_COVER = 'https://res.cloudinary.com/drbccjuul/image/upload/e_improve:outdoor/m2bmgchypxctuwaac801';

interface NotificationGroup {
  label: string;
  items: AppNotification[];
}

// Own route (not a panel bolted onto the profile page) so a push notification
// click - which can only ever open a plain URL, never carry Angular Router
// `state` - has somewhere real to land. See backend/utils/pushNotifications.js:
// every push opens this page first; tapping a row here is what deep-links
// into the actual item.
@Component({
  selector: 'app-notifications-page',
  standalone: true,
  imports: [CommonModule, TimeAgoPipe],
  templateUrl: './notifications-page.component.html',
  styleUrls: ['./notifications-page.component.css'],
  animations: [
    trigger('fadeSlideIn', [
      // Animate the container
      transition(':enter', [
        query('@itemAnim', [
          stagger(50, animateChild())
        ], { optional: true })
      ])
    ]),

    // This handles each individual item
    trigger('itemAnim', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(-20px)' }), // swipe in from left
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateX(0)' }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0, transform: 'translateX(20px)' })) // swipe out to right
      ])
    ])
  ]
})
export class NotificationsPageComponent implements OnInit, OnDestroy {
  notifications: AppNotification[] = [];
  isLoadingNotifications = false;
  isDeletingAllNotifications = false;
  activeFilter: NotificationFilter = 'all';

  // Swipe-to-delete (mobile only - desktop keeps the checkmark button, mouse
  // users don't swipe). Card slides left over a fixed red trash panel behind
  // it; dragging past SWIPE_THRESHOLD_PX and releasing snaps fully open to
  // SWIPE_REVEAL_PX instead of settling wherever the finger happened to stop,
  // same drag-then-snap approach already used for the cinema page's
  // full-screen image swipe (cinema-review-page.component.ts).
  private static readonly SWIPE_REVEAL_PX = 80;
  private static readonly SWIPE_THRESHOLD_PX = 40;
  // Public copy so the template can size/position the trash panel from the
  // same number the drag-clamp logic below uses, instead of a second
  // hardcoded 80 that could quietly drift out of sync with this one.
  readonly swipeRevealPx = NotificationsPageComponent.SWIPE_REVEAL_PX;
  isMobileView = false;
  swipeOffsetPx: { [id: string]: number } = {};
  swipingRowId: string | null = null; // disables the CSS transition only while actively dragging this row
  isDeletingRow: { [id: string]: boolean } = {};
  private draggingNotificationId: string | null = null;
  private activeSwipePointerId: number | null = null;
  private dragStartX = 0;
  private dragStartOffset = 0;
  private readonly onResize = () => (this.isMobileView = window.innerWidth < 768);

  // Moved here from the Edit Profile page - notification settings belong
  // next to the notifications they control, not buried in profile editing.
  showSettings = false;
  pushEnabled = false;
  isUpdatingNotifications = false;
  notificationPreferences: NotificationPreferences = {
    immediateMusic: true,
    immediateMovies: true,
    immediateTvEpisodes: true,
    immediateTvSeasons: true,
    weeklySummary: false,
    weeklySummaryDay: 1,
    weeklySummaryHour: 9,
    timezone: 'America/Chicago',
  };

  readonly filterOptions: { value: NotificationFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'movies', label: 'Movies' },
    { value: 'tv', label: 'TV Shows' },
    { value: 'music', label: 'Music' },
  ];

  constructor(
    private notificationService: NotificationService,
    private modal: NgbModal,
    private router: Router,
    private userService: UserService,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    this.loadNotifications();
    this.notificationService.getPreferences().subscribe({
      next: ({ preferences }) => (this.notificationPreferences = preferences),
    });
    this.isMobileView = window.innerWidth < 768;
    window.addEventListener('resize', this.onResize);
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.onResize);
  }

  toggleSettings(): void {
    this.showSettings = !this.showSettings;
  }

  enableNotifications(): void {
    if (this.isUpdatingNotifications) return;
    this.isUpdatingNotifications = true;
    this.notificationService.enablePush().subscribe((enabled) => {
      this.pushEnabled = enabled;
      this.isUpdatingNotifications = false;
      this.toastr[enabled ? 'success' : 'error'](
        enabled ? 'Notifications enabled.' : 'Notifications could not be enabled. Install the PWA and allow notifications first.',
        enabled ? 'Success' : 'Notifications'
      );
    });
  }

  disableNotifications(): void {
    if (this.isUpdatingNotifications) return;
    this.isUpdatingNotifications = true;
    this.notificationService.disablePush().subscribe({
      next: () => {
        this.pushEnabled = false;
        this.isUpdatingNotifications = false;
        this.toastr.success('Notifications disabled.', 'Success');
      },
      error: () => (this.isUpdatingNotifications = false),
    });
  }

  updateNotificationPreference(field: keyof NotificationPreferences, value: boolean): void {
    this.notificationPreferences = { ...this.notificationPreferences, [field]: value };
    this.notificationService.updatePreferences({ [field]: value }).subscribe();
  }

  goBack(): void {
    this.userService.userProfile$.subscribe((profile) => {
      this.router.navigate([profile?._id ? `/profile/${profile._id}` : '/profile']);
    }).unsubscribe();
  }

  loadNotifications(): void {
    this.isLoadingNotifications = true;
    this.notificationService.getNotifications().subscribe({
      next: ({ notifications }) => {
        this.notifications = notifications;
        this.isLoadingNotifications = false;
      },
      error: () => (this.isLoadingNotifications = false),
    });
  }

  setFilter(filter: NotificationFilter): void {
    this.activeFilter = filter;
  }

  get filteredNotifications(): AppNotification[] {
    if (this.activeFilter === 'all') return this.notifications;
    if (this.activeFilter === 'movies') return this.notifications.filter((n) => n.type === 'movie-release');
    if (this.activeFilter === 'tv') return this.notifications.filter((n) => n.type === 'tv-episode' || n.type === 'tv-season');
    return this.notifications.filter((n) => n.type === 'music-release');
  }

  // Buckets by createdAt relative to local calendar days, matching the
  // Today / This Week / Earlier sections notification centers commonly use -
  // groups with no items are omitted rather than shown empty.
  get groupedNotifications(): NotificationGroup[] {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - 6);

    const today: AppNotification[] = [];
    const thisWeek: AppNotification[] = [];
    const earlier: AppNotification[] = [];

    for (const notification of this.filteredNotifications) {
      const createdAt = new Date(notification.createdAt);
      if (createdAt >= startOfToday) today.push(notification);
      else if (createdAt >= startOfWeek) thisWeek.push(notification);
      else earlier.push(notification);
    }

    return [
      { label: 'Today', items: today },
      { label: 'This Week', items: thisWeek },
      { label: 'Earlier', items: earlier },
    ].filter((group) => group.items.length > 0);
  }

  trackByGroupLabel(_index: number, group: NotificationGroup): string {
    return group.label;
  }

  trackByNotificationId(_index: number, notification: AppNotification): string {
    return notification._id;
  }

  isCinemaNotification(notification: AppNotification): boolean {
    return notification.type === 'movie-release' || notification.type === 'tv-episode' || notification.type === 'tv-season';
  }

  notificationBadge(notification: AppNotification): string {
    switch (notification.type) {
      case 'movie-release':
        return 'MOVIE';
      case 'tv-episode':
      case 'tv-season':
        return 'TV SHOW';
      case 'music-release':
        return 'MUSIC';
      default:
        return 'REPORT';
    }
  }

  notificationCover(notification: AppNotification): string {
    return notification.details?.cover || FALLBACK_COVER;
  }

  // Deezer cover URLs stored on the notification (see notificationJobs.js /
  // pushNotifications.js) are the default resolution - the main search page
  // upgrades these to full quality before opening the review modal
  // (main-search.component.ts's getHighQualityImage), but that upgrade never
  // happened for a cover coming straight from a notification, so it opened
  // blurry. Mirrors that same logic here.
  private getHighQualityImage(imageUrl: string | undefined): string {
    if (!imageUrl) return '';
    if (imageUrl.includes('api.deezer.com')) {
      return `${imageUrl}?size=xl`;
    }
    return imageUrl;
  }

  deleteNotification(notification: AppNotification): void {
    // deleteNotification() already updates notificationService's shared
    // count on success (see notification.service.ts) - the navbar/profile
    // bells pick that up via their notificationCount$ subscription.
    this.notificationService.deleteNotification(notification._id).subscribe({
      next: () => (this.notifications = this.notifications.filter((item) => item._id !== notification._id)),
    });
  }

  // Mobile swipe-to-delete's trash button - separate from deleteNotification()
  // above (still used by the desktop checkmark button) because this one
  // needs its own loading/disabled state on the specific row being deleted,
  // and must clear that state again on failure so the button doesn't stay
  // stuck disabled with a spinner forever if the request fails.
  onSwipeDelete(notification: AppNotification): void {
    if (this.isDeletingRow[notification._id]) return;
    this.isDeletingRow[notification._id] = true;
    this.notificationService.deleteNotification(notification._id).subscribe({
      next: () => {
        this.notifications = this.notifications.filter((item) => item._id !== notification._id);
      },
      error: () => {
        this.isDeletingRow[notification._id] = false;
        this.swipeOffsetPx[notification._id] = 0;
      },
    });
  }

  // Tapping an already-open (swiped) row just closes it instead of
  // navigating - matches the common swipe-to-delete convention of requiring
  // a second, deliberate tap on the trash icon itself to actually delete.
  onRowTap(notification: AppNotification): void {
    if ((this.swipeOffsetPx[notification._id] || 0) !== 0) {
      this.swipeOffsetPx[notification._id] = 0;
      return;
    }
    this.openNotificationItem(notification);
  }

  onRowPointerDown(event: PointerEvent, notification: AppNotification): void {
    if (!this.isMobileView || this.draggingNotificationId) return;
    this.draggingNotificationId = notification._id;
    this.activeSwipePointerId = event.pointerId;
    this.dragStartX = event.clientX;
    this.dragStartOffset = this.swipeOffsetPx[notification._id] || 0;
    this.swipingRowId = notification._id;
  }

  onRowPointerMove(event: PointerEvent, notification: AppNotification): void {
    if (this.draggingNotificationId !== notification._id || event.pointerId !== this.activeSwipePointerId) return;
    const delta = event.clientX - this.dragStartX;
    const next = this.dragStartOffset + delta;
    this.swipeOffsetPx[notification._id] = Math.min(0, Math.max(-NotificationsPageComponent.SWIPE_REVEAL_PX, next));
  }

  onRowPointerUp(event: PointerEvent, notification: AppNotification): void {
    if (this.draggingNotificationId !== notification._id || event.pointerId !== this.activeSwipePointerId) return;
    this.finishSwipeDrag(notification._id);
  }

  onRowPointerCancel(notification: AppNotification): void {
    if (this.draggingNotificationId !== notification._id) return;
    this.finishSwipeDrag(notification._id);
  }

  private finishSwipeDrag(id: string): void {
    this.draggingNotificationId = null;
    this.activeSwipePointerId = null;
    this.swipingRowId = null; // re-enable the transition for the snap below
    const current = this.swipeOffsetPx[id] || 0;
    this.swipeOffsetPx[id] = current <= -NotificationsPageComponent.SWIPE_THRESHOLD_PX ? -NotificationsPageComponent.SWIPE_REVEAL_PX : 0;
  }

  deleteAllNotifications(): void {
    if (this.isDeletingAllNotifications) return;
    this.isDeletingAllNotifications = true;
    this.notificationService.deleteAllNotifications().subscribe({
      next: () => {
        this.notifications = [];
        this.isDeletingAllNotifications = false;
      },
      error: () => (this.isDeletingAllNotifications = false),
    });
  }

  // weekly-summary is a multi-item digest with no single target - it keeps
  // navigating to its own targetUrl (the calendar). Every other type opens
  // the item's own detail view directly, built from `details` (populated at
  // notification-creation time - see notificationJobs.js/pushNotifications.js)
  // instead of just landing on a generic calendar link. Falls back to
  // targetUrl if `details` is missing (older notifications sent before this
  // was added).
  openNotificationItem(notification: AppNotification): void {
    const details = notification.details;

    if (notification.type === 'weekly-summary') {
      this.router.navigateByUrl(notification.targetUrl);
      return;
    }

    if (notification.type === 'music-release' && details?.albumId) {
      this.openMusicRelease(details);
      return;
    }

    if (
      (notification.type === 'movie-release' || notification.type === 'tv-episode' || notification.type === 'tv-season') &&
      details?.tmdbId &&
      details?.mediaType
    ) {
      this.openCinemaItem(details);
      return;
    }

    this.router.navigateByUrl(notification.targetUrl);
  }

  private openMusicRelease(details: NonNullable<AppNotification['details']>): void {
    const modalOptions: NgbModalOptions = {
      backdrop: 'static',
      keyboard: true,
      centered: true,
      scrollable: false,
    };

    const record = {
      id: Number(details.albumId),
      type: 'Album' as const,
      title: details.title ?? '',
      artist: details.artistName ?? '',
      cover: this.getHighQualityImage(details.cover),
      isExplicit: details.isExplicit,
      releaseDate: details.releaseDate,
      avgRating: 0,
      reviewCount: 0,
    };

    const modalRef = this.modal.open(ReviewPageComponent, modalOptions);
    modalRef.componentInstance.record = record;
    modalRef.componentInstance.recordList = [record];
    modalRef.componentInstance.currentIndex = 0;
  }

  // tv-episode/tv-season notifications open the show's overall detail here,
  // not the specific episode's subview - same simplification already used
  // for the cinema activity feed (main-search.component.ts).
  private openCinemaItem(details: NonNullable<AppNotification['details']>): void {
    const modalOptions: NgbModalOptions = {
      backdrop: 'static',
      keyboard: true,
      centered: true,
      scrollable: false,
      windowClass: 'cinema-detail-modal',
    };

    const record: CinemaItem = {
      type: 'Cinema',
      _id: details._id ?? '',
      user: '',
      mediaType: details.mediaType!,
      tmdbId: details.tmdbId,
      imdbId: details.imdbId,
      canonicalId: details.canonicalId,
      title: details.title ?? '',
      cover: details.cover,
      isWatchlist: details.isWatchlist ?? false,
      isWatched: details.isWatched ?? false,
      decimalRating: details.decimalRating,
      reviewText: details.reviewText,
      containsSpoilers: details.containsSpoilers,
      isUnrefinedImport: details.isUnrefinedImport ?? false,
      traktSynced: false,
      createdAt: new Date().toISOString(),
    };

    const modalRef = this.modal.open(CinemaReviewModalComponent, modalOptions);
    modalRef.componentInstance.record = record;
    modalRef.componentInstance.recordList = [record];
    modalRef.componentInstance.currentIndex = 0;
  }
}
