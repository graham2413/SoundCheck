# Cinema Feature Roadmap

Working roadmap for the cinema (movies/TV) feature. Status reflects what's
actually built vs. planned, revised from an earlier draft to account for
decisions already made (see "Already Done" and inline notes).

## Current Priority

Phase 1 is paused (a larger review-page UI revamp is planned first). Next up:
1. Cinema search results UI revamp
2. Phase 2 (Calendar Engine & Dual Web/Nuvio Addon Integration)
3. Resume Phase 1

## Phase 1: Core Cinema Data, Detail Pages & Live IMDb Stats (paused)

- [ ] Build real TMDb search endpoint (replace debug route) + frontend search UI
- [ ] Build real TMDb detail endpoint (replace debug route)
- [ ] Map `watch/providers` response into `streamingPlatforms` when saving a record
- [x] Build a cinema detail page (movie/show view) — reused `review-page.component` (the existing music modal) instead of a new page; front panel (poster, type label, rating circle, genre-less for now) and full reviews section (list, filter, add/edit/delete, like) now work for cinema records the same as music
- [ ] Wire detail page to call `getImdbStats` for live IMDb rating/votes
- [x] Display `reviewText`/`likes` on the detail page — done via the shared reviews-list UI (`getCinemaReviews` endpoint + `mapCinemaReviewToReview` normalization)
- [ ] Display full cast list (name, character played, photo) on the detail page — **data already available**: `getTmdbDetails` now requests `credits` via `append_to_response`, just needs mapping to UI (profile photos need the same `image.tmdb.org` prefix used for posters)
- [ ] Pending decision: Nested TV Hierarchy (seasons/episodes, per-episode watched flags, progress bar) — schema already exists (`CinemaItem.seasons`), nothing populates or displays it yet. Build later in development, or drop? (see Open Questions)

## Phase 2: Calendar Engine & Dual Web/Nuvio Addon Integration

- [x] Per-Episode Calendar Engine — `GET /api/cinema/calendar` built (`cinemaController.getCalendar`). Pulls next-episode-to-air for tracked TV shows (watchlisted OR reviewed, via TMDb's native `next_episode_to_air` field - no extra call type needed) plus watchlisted movies with a future `release_date`. Sorted soonest-first.
- [x] Rating an item now auto-clears `isWatchlist` (`editCinemaItem`) so "watched, not yet reviewed" doesn't linger as "still to watch".
- [ ] Countdown Engine — convert ISO timestamps into relative daily countdowns ("Airs Today", "In 3 days") - do this client-side, not in the API response.
- [ ] Web App UI — new **Calendar nav item + page** (own bottom-nav/desktop-dropdown destination, not folded into Watchlist/profile - see "Nav Items" note below).
- [ ] Nuvio / Stremio Addon Engine — expose `GET /manifest.json` and `GET /catalog/series/upcoming.json`. Reads directly from **SoundCheck's own database** (the user's `CinemaItem` watchlist) — no Trakt dependency; add-to-watchlist in the app shows up in the addon directly.
- [ ] **Nuvio "watched" auto-detect → needs-review queue** (design only, not built): when the Nuvio addon detects a title was completed, it calls a new endpoint (e.g. `POST /api/cinema/mark-watched`) with the tmdbId, matching/creating the `CinemaItem`. **Important:** do NOT simply clear `isWatchlist` here without anything else set - if nothing else is true, the item silently disappears from the calendar too. Instead add a new `needsReview: Boolean` flag on `CinemaItem`, set independently of `isWatchlist` (`isWatchlist` can still flip to false since it's no longer "to watch", but `needsReview: true` keeps it visible to both the calendar query and a new "Reviews · needs review" filter/badge on the profile page's existing Reviews tile). Update the calendar's `$or` query to include `{ needsReview: true }` alongside `{ isWatchlist: true }` / `{ decimalRating: { $ne: null } }`.

## Nav Items (decided during Calendar planning)

- **Now:** adding **Calendar** as a real 4th bottom-nav/desktop-dropdown item (Home, Calendar, Friends, Profile). Ready to build.
- **Backlog, not now:** possibly splitting today's Home (Discover: search+marquee+popular+activity) into a marquee-focused Home + a separate Discover/Search nav item. If this happens later, that's the practical ceiling for bottom-nav icons (5) - the Nuvio "needs review" queue above should stay a badge/panel on Profile, not become a 6th nav destination, to avoid an overcrowded bottom bar.

## Phase 4: Account Page, Universal Filters, Interactive Watchlist & Social Features

- [~] Universal Media Filter — **partially built**: the reviews panel now has a Music/Cinema toggle with sort (Newest/Oldest/Highest/Lowest) and type/genre filters. Not yet extended to other pages (e.g. Watchlist panel has no sort/filter yet).
- [~] Dedicated Cinema Watchlist View — **partially built**: the Watchlist panel already exists on the profile page (count tile, public/private toggle, poster grid). Not yet a fully dedicated standalone view. still needs sorting and other things
- [ ] Social & Friend Matching Features



## Open Questions

- Nested TV Hierarchy (seasons/episodes/progress bar): decided - will live on the show's own review-page under a new "Episodes" tab, not on a separate destination. Still not built.

## Backlog (not MVP, raw notes for later)

- Make the marquee horizontally scrollable/draggable.
- Viewing someone else's profile on mobile should highlight the relevant bottom-nav icon (probably "Friends", not whichever is currently active).
- Add a draggable scrubber/slider to the audio player to seek within a song.
- Add a subtle border to marquee cards for depth.
- Give the full-screen loader a cinema-reel visual element.
- Add small celebratory animations to every edit/create rating slider (e.g. something fun at a 10).
- Rename the Artists toggle/tab to "Release Tracker".
- Split the Activity feed tab into separate Music/Cinema sub-tabs.
- Smooth the transition from the full-screen loader into the home page.
- Find/replace the current smart-link service (needs research) for opening tracks in a user's preferred music app.
- Possible nav split: dedicated Discover/Search nav item, freeing Home to be marquee-focused (see "Nav Items" note above for bottom-nav capacity implications).
- Review UI overhaul (mobile/desktop unified): comment out the current `review-page` component and rebuild top-down in chunks, reusing logic from the commented-out version rather than starting from zero. Also fix background page scroll leaking through while the edit/create fullscreen overlay is open.
- Once the "edit review" rating-circle look is finalized, apply that same style consistently across Review (mobile/desktop), Edit (mobile/desktop), and Create (mobile/desktop).
- Tori's asks: (1) find an API that returns the songs/score used in a movie/show/episode (per-episode for TV); (2) add a "top 5 songs right now" widget to the profile, and an equivalent for cinema.

## Future-Proofing Note: Reviews/Watchlist List Scale

Reviews panel sort/filter (and the Watchlist panel) are currently **fully
client-side** — the whole list is fetched at once and sorted/filtered in the
browser. Fine at current scale (~130 cinema items). If these lists grow much
larger (e.g. thousands of items per user), revisit and move sorting/filtering/
pagination to the backend (new query params, `$skip`/`$limit`, keep the
combined-count header tile in sync with a paginated response). Not needed yet
— flagged so it isn't forgotten if usage grows.

## Cross-Feature: Personalized/Popular Marquee (Music + Cinema)

Note: spans both features, tracked here for now. Marquee has a music mode and
a cinema mode, each with two toggleable views:

- [ ] Music mode, view A — keep current marquee as-is: general/popular new Spotify releases
- [ ] Music mode, view B — personalized marquee: new releases from artists the user follows/tracks (up to last 110)
- [ ] Cinema mode, view A — generic popular new movie/show releases marquee (needs the same "popular new releases" pipeline built for music, adapted for movies/shows)
- [ ] Cinema mode, view B — personalized marquee: new releases from movies/shows the user follows/tracks (up to 110 maybe?)
- [ ] Toggle UI to switch between music/cinema mode and, within each, between the two views


to be sorted into a phase:

## Notification button behavior

* Opens a **Calendar Notifications** panel/modal from the Calendar screen.

* Shows a red unread indicator on the bell when there are unread calendar notifications.

* A notification becomes **read** when:

  * user manually opens the Calendar Notifications panel, or
  * user taps a mobile push notification that deep-links into the Calendar screen.

* Includes a **Mark all as read** button to clear unread notifications and remove the red bell indicator.

* Main tab/section: **Notifications**

  * Shows pushed calendar notifications.
  * Example items:

    * `Dark Matter S2E2 releases tomorrow`
    * `Silo S3E10 releases today`
    * `LINK CLICK S4E5 releases in 2 days`
  * Each item can show:

    * title poster thumbnail
    * episode/release info
    * timestamp
    * unread/read state
    * tap to open record detail page

* Second tab/section: **Alert Preferences**

  * Controls default reminder behavior for tracked releases.

* Includes master toggle:

  * `Calendar Notifications: On / Off`
  * If off, no release reminder push notifications are sent.

* Includes default reminder timing options:

  * `At release time`
  * `Day of release`
  * `1 day before`
  * `3 days before`
  * `7 days before`

* Better than radio only: allow multiple selected reminders.

  * Example:

    * checked: `1 day before`
    * checked: `Day of release`
    * unchecked: `7 days before`

* Optional but useful settings:

  * `Quiet hours`

    * Prevent notifications during selected hours.
  * `Digest mode`

    * Send one daily summary instead of separate alerts.
  * `Notify for`

    * `Episodes`
    * `Movies`
    * `Music releases`
  * `Only high-priority tracked items`

    * Useful if user tracks a lot.

* Recommended minimal version:

  * Bell opens modal.
  * Modal has two tabs:

    * `Notifications`
    * `Alert Preferences`
  * Notifications tab:

    * unread list
    * mark all as read
  * Alert Preferences tab:

    * master on/off toggle
    * multiple reminder timing checkboxes
    * quiet hours toggle optional.
