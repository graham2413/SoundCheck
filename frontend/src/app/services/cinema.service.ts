import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environments';
import { CinemaItem, CinemaReviewsResponse, CinemaSearchResult, ImdbStatsResponse, CalendarEntry, CalendarSubtitle, CalendarMonthGroup, CinemaDetailResponse, CinemaPersonDetailResponse, CinemaPopularActor, CinemaSeasonEpisodesResponse, EpisodeImdbRatingsResponse, EpisodeReviewsResponse, CinemaSoundtrackResponse, CinemaActivityFeedResponse } from '../models/responses/cinema-response';

export interface WatchlistCursor {
  cursorValue: string;
  cursorId: string;
}

export interface WatchlistFilters {
  mediaType?: 'movie' | 'tv';
  search?: string;
  status?: 'unwatched' | 'watched';
  releaseStatus?: 'available' | 'in_theaters' | 'coming_soon' | 'new_episodes' | 'back_in_theaters';
  genre?: string;
  provider?: string;
  hasReleaseDate?: boolean;
  hasRating?: boolean;
  sortBy?: 'dateAdded' | 'releaseDate' | 'title';
  sortOrder?: 'asc' | 'desc';
}

export interface WatchlistResponse {
  success: boolean;
  data: CinemaItem[];
  nextCursor: WatchlistCursor | null;
  totalCount: number;
  watchlistCount: number;
  mediaTypeCounts: { all: number; movie: number; tv: number };
}

@Injectable({
  providedIn: 'root'
})
export class CinemaService {
  private apiUrl = environment.cinema;

  constructor(private http: HttpClient) {}

  private authHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  // Live IMDb community rating/vote count (Redis-cached on backend, no auth required)
  getImdbStats(imdbId: string): Observable<ImdbStatsResponse> {
    return this.http.get<ImdbStatsResponse>(`${this.apiUrl}/imdb-stats/${imdbId}`);
  }

  // Consolidated detail payload for the cinema review page (TMDb metadata/credits/providers + OMDb ratings/awards)
  getCinemaDetail(mediaType: 'movie' | 'tv', tmdbId: string): Observable<CinemaDetailResponse> {
    return this.http.get<CinemaDetailResponse>(`${this.apiUrl}/detail/${mediaType}/${tmdbId}`, {
      headers: this.authHeaders(),
    });
  }

  // Real soundtrack tracks (SoundtrackDB's Spotify playlist first, MusicBrainz
  // fallback, Redis-cached on the backend - series-level only for TV).
  // `title`/`year`/`mediaType` drive the SoundtrackDB lookup (it's a title
  // search, not IMDb-keyed); `releaseDate` only affects the backend's cache
  // TTL (shorter for a recently-released title whose SoundtrackDB entry may
  // still be settling).
  getSoundtrack(
    imdbId: string,
    opts: { title?: string; year?: number | null; mediaType?: 'movie' | 'tv'; releaseDate?: string | null } = {}
  ): Observable<CinemaSoundtrackResponse> {
    const params: Record<string, string> = {};
    if (opts.title) params['title'] = opts.title;
    if (opts.year) params['year'] = String(opts.year);
    if (opts.mediaType) params['mediaType'] = opts.mediaType;
    if (opts.releaseDate) params['releaseDate'] = opts.releaseDate;

    return this.http.get<CinemaSoundtrackResponse>(`${this.apiUrl}/soundtrack/${imdbId}`, {
      headers: this.authHeaders(),
      params,
    });
  }

  // Episode name/overview/air date/still image for one season (TMDb-sourced)
  getTvSeasonEpisodes(tmdbId: string, seasonNumber: number): Observable<CinemaSeasonEpisodesResponse> {
    return this.http.get<CinemaSeasonEpisodesResponse>(`${this.apiUrl}/tv/${tmdbId}/season/${seasonNumber}`, {
      headers: this.authHeaders(),
    });
  }

  // Per-episode IMDb ratings for a whole show (all seasons in one call) - see
  // backend/utils/imdbEpisodeMap.js for the cacheStatus hit/stale/miss/processing states.
  getEpisodeImdbRatings(parentTconst: string, showStatus?: 'ended' | 'ongoing'): Observable<EpisodeImdbRatingsResponse> {
    return this.http.get<EpisodeImdbRatingsResponse>(`${this.apiUrl}/tv/${parentTconst}/episodes/imdb-ratings`, {
      headers: this.authHeaders(),
      params: showStatus ? { showStatus } : {},
    });
  }

  // Everyone's reviews (rating + text) for one specific episode
  getEpisodeReviews(
    tmdbId: string,
    seasonNumber: number,
    episodeNumber: number,
    sort: 'recent' | 'highest' = 'recent'
  ): Observable<{ success: boolean; data: EpisodeReviewsResponse }> {
    return this.http.get<{ success: boolean; data: EpisodeReviewsResponse }>(
      `${this.apiUrl}/tv/${tmdbId}/episode/${seasonNumber}/${episodeNumber}/reviews`,
      { headers: this.authHeaders(), params: { sort } }
    );
  }

  // Whether the current user already has this exact title tracked (watchlist/watched/rating) -
  // used when opening from an untracked context (search results) with no real CinemaItem yet.
  getCinemaItemStatus(mediaType: 'movie' | 'tv', tmdbId: string): Observable<{ success: boolean; data: CinemaItem | null }> {
    return this.http.get<{ success: boolean; data: CinemaItem | null }>(`${this.apiUrl}/status/${mediaType}/${tmdbId}`, {
      headers: this.authHeaders(),
    });
  }

  // Bio + filmography + social links for the cast detail popup
  getCinemaPersonDetail(personId: number): Observable<CinemaPersonDetailResponse> {
    return this.http.get<CinemaPersonDetailResponse>(`${this.apiUrl}/person/${personId}`, {
      headers: this.authHeaders(),
    });
  }

  // Top 50 Actors ranking, TMDb-wide (not scoped to any single title)
  getPopularActors(): Observable<{ success: boolean; data: CinemaPopularActor[] }> {
    return this.http.get<{ success: boolean; data: CinemaPopularActor[] }>(`${this.apiUrl}/popular-actors`, {
      headers: this.authHeaders(),
    });
  }

  // Search movies/shows via TMDb
  searchCinema(query: string): Observable<{ success: boolean; data: CinemaSearchResult[] }> {
    return this.http.get<{ success: boolean; data: CinemaSearchResult[] }>(`${this.apiUrl}/search`, {
      headers: this.authHeaders(),
      params: { query },
    });
  }

  // Per-result "nice to have" extras (real TV year range, badge fields) -
  // searchCinema itself only returns the fast /search/multi fields; the
  // caller fetches this independently per result so one slow/rate-limited
  // title's extras don't hold up any other result's. See
  // getSearchEnrichment's own comment in cinemaController.js.
  getSearchEnrichment(
    mediaType: 'movie' | 'tv',
    tmdbId: string
  ): Observable<{ success: boolean; data: Partial<CinemaSearchResult> | null }> {
    return this.http.get<{ success: boolean; data: Partial<CinemaSearchResult> | null }>(
      `${this.apiUrl}/search-enrichment/${mediaType}/${tmdbId}`,
      { headers: this.authHeaders() }
    );
  }

  // Trending movies/shows this week (powers the cinema marquee)
  getTrendingCinema(mediaType: 'movie' | 'tv'): Observable<{ success: boolean; data: CinemaSearchResult[] }> {
    return this.http.get<{ success: boolean; data: CinemaSearchResult[] }>(`${this.apiUrl}/trending`, {
      headers: this.authHeaders(),
      params: { mediaType },
    });
  }

  // A user's watchlist - owner always allowed, others only if public.
  // Cursor-paginated (same pattern as the activity/artist feeds) so a large
  // watchlist doesn't have to load/render all at once. All narrowing options
  // live on `filters` (all optional/omittable for "no filter").
  getWatchlist(
    userId: string,
    cursor?: WatchlistCursor | null,
    filters: WatchlistFilters = {}
  ): Observable<WatchlistResponse> {
    let params: Record<string, string> = { limit: '30' };
    if (cursor) {
      params = { ...params, cursorValue: cursor.cursorValue, cursorId: cursor.cursorId };
    }
    if (filters.mediaType) params = { ...params, mediaType: filters.mediaType };
    if (filters.search?.trim()) params = { ...params, search: filters.search.trim() };
    if (filters.status) params = { ...params, status: filters.status };
    if (filters.releaseStatus) params = { ...params, releaseStatus: filters.releaseStatus };
    if (filters.genre) params = { ...params, genre: filters.genre };
    if (filters.provider) params = { ...params, provider: filters.provider };
    if (filters.hasReleaseDate) params = { ...params, hasReleaseDate: 'true' };
    if (filters.hasRating) params = { ...params, hasRating: 'true' };
    if (filters.sortBy) params = { ...params, sortBy: filters.sortBy };
    if (filters.sortOrder) params = { ...params, sortOrder: filters.sortOrder };

    return this.http.get<WatchlistResponse>(`${this.apiUrl}/watchlist/${userId}`, {
      headers: this.authHeaders(),
      params,
    });
  }

  // Distinct genres/providers actually present in the user's watchlist -
  // powers the Genre/Availability dropdowns in the filter overlay.
  getWatchlistFilterOptions(
    userId: string
  ): Observable<{ success: boolean; genres: string[]; providers: string[] }> {
    return this.http.get<{ success: boolean; genres: string[]; providers: string[] }>(
      `${this.apiUrl}/watchlist/${userId}/filters`,
      { headers: this.authHeaders() }
    );
  }

  // Add/remove a movie or show from the current user's watchlist
  toggleWatchlist(payload: {
    tmdbId: string;
    mediaType: 'movie' | 'tv';
    title: string;
    cover?: string;
    releaseDate?: string;
  }): Observable<{ success: boolean; data: { isWatchlist: boolean; item: CinemaItem | null } }> {
    return this.http.post<{ success: boolean; data: { isWatchlist: boolean; item: CinemaItem | null } }>(
      `${this.apiUrl}/watchlist/toggle`,
      payload,
      { headers: this.authHeaders() }
    );
  }

  // Toggles watched WITHOUT a rating (e.g. "seen it, don't want to rate it") -
  // data is null if the item had nothing else tracking it and got deleted.
  markWatched(payload: {
    tmdbId: string;
    mediaType: 'movie' | 'tv';
    title: string;
    cover?: string;
    releaseDate?: string;
  }): Observable<{ success: boolean; data: CinemaItem | null }> {
    return this.http.post<{ success: boolean; data: CinemaItem | null }>(
      `${this.apiUrl}/mark-watched`,
      payload,
      { headers: this.authHeaders() }
    );
  }

  // Upcoming (default) or past episodes/releases for the current user's
  // tracked shows/movies. TMDb lookups are cached for 24h server-side; pass
  // forceRefresh to bypass. Paginated (offset/limit, not cursorDate/cursorId -
  // see cinemaController.js's getCalendar for why) since the full list can be
  // large and every item's cover image/animation rendering all at once was
  // what made a big calendar feel sluggish on mobile.
  getCalendar(
    forceRefresh = false,
    range: 'upcoming' | 'past' = 'upcoming',
    offset = 0,
    limit = 20,
    mediaType: 'all' | 'movie' | 'tv' = 'all'
  ): Observable<{
    success: boolean;
    data: CalendarEntry[];
    hasMore: boolean;
    total: number;
    subtitle: CalendarSubtitle;
    monthGroups: CalendarMonthGroup[];
  }> {
    let params: Record<string, string> = { range, offset: String(offset), limit: String(limit), mediaType };
    if (forceRefresh) params = { ...params, refresh: 'true' };

    return this.http.get<{
      success: boolean;
      data: CalendarEntry[];
      hasMore: boolean;
      total: number;
      subtitle: CalendarSubtitle;
      monthGroups: CalendarMonthGroup[];
    }>(`${this.apiUrl}/calendar`, {
      headers: this.authHeaders(),
      params,
    });
  }

  // Import a Trakt data-export zip (ratings + watchlist) as CinemaItems for the current user
  importTraktExport(file: File): Observable<{
    success: boolean;
    data: { imported: number; skipped: number; duplicates: number; total: number; coversUpdated: number };
  }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{
      success: boolean;
      data: { imported: number; skipped: number; duplicates: number; total: number; coversUpdated: number };
    }>(
      `${this.apiUrl}/import-trakt`,
      formData,
      { headers: this.authHeaders() }
    );
  }

  // Submit a precise decimal rating (and optionally review text) for an imported item
  editCinemaItem(id: string, decimalRating: number, reviewText?: string): Observable<{ success: boolean; data: CinemaItem }> {
    return this.http.patch<{ success: boolean; data: CinemaItem }>(
      `${this.apiUrl}/${id}/refine`,
      { decimalRating, ...(reviewText !== undefined ? { reviewText } : {}) },
      { headers: this.authHeaders() }
    );
  }

  // Create/edit a rating+review for a whole movie/show - creates the
  // CinemaItem if it doesn't exist yet (no pre-existing _id required).
  rateCinema(payload: {
    tmdbId: string;
    mediaType: 'movie' | 'tv';
    title: string;
    cover?: string | null;
    releaseDate?: string | null;
    decimalRating: number;
    reviewText?: string;
    containsSpoilers?: boolean;
  }): Observable<{ success: boolean; data: CinemaItem }> {
    return this.http.post<{ success: boolean; data: CinemaItem }>(
      `${this.apiUrl}/rate`,
      payload,
      { headers: this.authHeaders() }
    );
  }

  // Toggle watched (no rating) for one specific episode - creates the show's
  // CinemaItem if it isn't tracked yet.
  markEpisodeWatched(payload: {
    tmdbId: string;
    title: string;
    cover?: string | null;
    releaseDate?: string | null;
    seasonNumber: number;
    episodeNumber: number;
  }): Observable<{ success: boolean; data: { isWatched: boolean; decimalRating: number | null; reviewText: string | null; containsSpoilers: boolean } | null }> {
    return this.http.post<{ success: boolean; data: { isWatched: boolean; decimalRating: number | null; reviewText: string | null; containsSpoilers: boolean } | null }>(
      `${this.apiUrl}/episode/mark-watched`,
      payload,
      { headers: this.authHeaders() }
    );
  }

  // Create/edit a rating+review for one specific episode - creates the
  // show's CinemaItem if it isn't tracked yet.
  rateEpisode(payload: {
    tmdbId: string;
    title: string;
    cover?: string | null;
    releaseDate?: string | null;
    seasonNumber: number;
    episodeNumber: number;
    decimalRating: number;
    reviewText?: string;
    containsSpoilers?: boolean;
  }): Observable<{ success: boolean; data: { isWatched: boolean; decimalRating: number | null; reviewText: string | null; containsSpoilers: boolean } }> {
    return this.http.post<{ success: boolean; data: { isWatched: boolean; decimalRating: number | null; reviewText: string | null; containsSpoilers: boolean } }>(
      `${this.apiUrl}/episode/rate`,
      payload,
      { headers: this.authHeaders() }
    );
  }

  // Everyone's reviews (rating + text) for the same movie/show as `item`,
  // paginated via offset/limit (mirrors getCalendar's pattern) - `userReview`,
  // `totalCount` and `avgRating` are computed server-side across ALL reviews
  // regardless of page, so the header stays accurate as more pages load.
  getCinemaReviews(
    item: CinemaItem,
    sort: 'recent' | 'highest' | 'liked' = 'recent',
    offset = 0,
    limit = 20
  ): Observable<{ success: boolean; data: CinemaReviewsResponse }> {
    let params = new HttpParams().set('sort', sort).set('offset', offset).set('limit', limit);

    if (item.imdbId) {
      params = params.set('imdbId', item.imdbId);
    } else if (item.tmdbId) {
      params = params.set('tmdbId', item.tmdbId).set('mediaType', item.mediaType);
    } else if (item.canonicalId) {
      params = params.set('canonicalId', item.canonicalId).set('mediaType', item.mediaType);
    }

    return this.http.get<{ success: boolean; data: CinemaReviewsResponse }>(`${this.apiUrl}/reviews`, {
      headers: this.authHeaders(),
      params,
    });
  }

  // Chronological feed of self + friends' cinema activity - mirrors
  // ReviewService.getActivityFeed's cursor-based pagination for music.
  getCinemaActivityFeed(
    params: { cursorDate?: string; cursorId?: string; limit?: number } = {}
  ): Observable<CinemaActivityFeedResponse> {
    let httpParams = new HttpParams();
    if (params.cursorDate) httpParams = httpParams.set('cursorDate', params.cursorDate);
    if (params.cursorId) httpParams = httpParams.set('cursorId', params.cursorId);
    if (params.limit !== undefined) httpParams = httpParams.set('limit', params.limit.toString());

    return this.http.get<CinemaActivityFeedResponse>(`${this.apiUrl}/activityFeed`, {
      headers: this.authHeaders(),
      params: httpParams,
    });
  }
}
