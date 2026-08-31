# Cinema Feature Roadmap

Working roadmap for the cinema (movies/TV) feature. Status reflects what's
actually built vs. planned, revised from an earlier draft to account for
decisions already made (see "Already Done" and inline notes).

## Phase 1: Core Cinema Data, Detail Pages & Live IMDb Stats

- [ ] Build real TMDb search endpoint (replace debug route) + frontend search UI
- [ ] Build real TMDb detail endpoint (replace debug route)
- [ ] Map `watch/providers` response into `streamingPlatforms` when saving a record
- [x] Build a cinema detail page (movie/show view) — reused `review-page.component` (the existing music modal) instead of a new page; front panel (poster, type label, rating circle, genre-less for now) and full reviews section (list, filter, add/edit/delete, like) now work for cinema records the same as music
- [ ] Wire detail page to call `getImdbStats` for live IMDb rating/votes
- [x] Display `reviewText`/`likes` on the detail page — done via the shared reviews-list UI (`getCinemaReviews` endpoint + `mapCinemaReviewToReview` normalization)
- [ ] Display full cast list (name, character played, photo) on the detail page — **data already available**: `getTmdbDetails` now requests `credits` via `append_to_response`, just needs mapping to UI (profile photos need the same `image.tmdb.org` prefix used for posters)
- [ ] Pending decision: Nested TV Hierarchy (seasons/episodes, per-episode watched flags, progress bar) — schema already exists (`CinemaItem.seasons`), nothing populates or displays it yet. Build later in development, or drop? (see Open Questions)

## Phase 2: Calendar Engine & Dual Web/Nuvio Addon Integration

- [ ] Per-Episode Calendar Engine — build via **TMDb** (poll each watchlisted show's "next episode to air" using `callTmdb.js`), **not** Trakt's `/calendars/my/shows` (that endpoint requires a per-user Trakt `access_token`, which we don't have since OAuth is blocked by Trakt's VIP paywall)
- [ ] Countdown Engine — convert ISO timestamps into relative daily countdowns ("Airs Today", "In 3 days")
- [ ] Web App UI — expose `GET /api/calendar` to render an "Upcoming Episodes" row/tab
- [ ] Nuvio / Stremio Addon Engine — expose `GET /manifest.json` and `GET /catalog/series/upcoming.json`. Reads directly from **SoundCheck's own database** (the user's `CinemaItem` watchlist) — no Trakt dependency; add-to-watchlist in the app shows up in the addon directly.

## Phase 4: Account Page, Universal Filters, Interactive Watchlist & Social Features

- [~] Universal Media Filter — **partially built**: the reviews panel now has a Music/Cinema toggle with sort (Newest/Oldest/Highest/Lowest) and type/genre filters. Not yet extended to other pages (e.g. Watchlist panel has no sort/filter yet).
- [~] Dedicated Cinema Watchlist View — **partially built**: the Watchlist panel already exists on the profile page (count tile, public/private toggle, poster grid). Not yet a fully dedicated standalone view. still needs sorting and other things
- [ ] Social & Friend Matching Features



## Open Questions

- Nested TV Hierarchy (seasons/episodes/progress bar, Phase 1): build later in development, or drop entirely?

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
