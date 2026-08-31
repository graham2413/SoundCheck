# Backend Architecture Notes

Internal reference doc for how core data/content patterns work in this codebase.
Not user-facing docs — just context for future development decisions.

## Review vs. CinemaItem — same concept, different content type

`Review` (music: songs/albums/artists) and `CinemaItem` (movies/TV) are **the same
kind of thing** conceptually — each is a single, self-contained document that
represents "what a user thinks of a specific piece of content." They're just
named differently because they cover different domains and `CinemaItem` has a
couple of extra cinema-only concerns (watchlist tracking, import status).

| | `Review` (music) | `CinemaItem` (movies/TV) |
|---|---|---|
| One document per | user + song/album/artist | user + movie/show |
| Holds content snapshot | title, artist, cover, genre, etc. | title, cover, genre, releaseDate, etc. |
| Holds rating | `rating` (0-10, nullable) | `decimalRating` (0-10, nullable) |
| Holds review text | `reviewText` | `reviewText` |
| Likes | `likes` / `likedBy` | `likes` / `likedBy` |
| Extra fields | n/a | `isWatchlist`, `isUnrefinedImport`, `traktSynced`, `seasons` (TV only) |

**Important:** `reviewController.js`'s functions only operate on the `Review`
collection. They will **not** automatically work for `CinemaItem` — equivalent
create/edit/delete/like functions still need to be built for cinema
separately (likely in `cinemaController.js`), mirroring the same logic
pattern. The model fields exist now; the controller endpoints don't yet.

## No shared "master" catalog record — and that's intentional

There is **no shared/normalized record** for a piece of content that multiple
users' reviews point back to. If 50 users review "A Beautiful Mind," that's 50
separate `Review` documents, each with its own embedded copy of the title/
cover/etc. Same design applies to `CinemaItem`.

This is deliberate denormalization for read performance (a very standard
MongoDB/NoSQL pattern), not an oversight:
- Fetching a user's reviews/cinema items is a single query — no joins needed.
- Aggregate stats (e.g. "average rating across everyone for this movie") are
  computed via a `$match` + `$group` aggregation across all documents sharing
  the same `canonicalId`/`imdbId` — see `getTopByType` in `reviewController.js`
  for the existing pattern this would mirror for cinema.
- Each review/item is fully self-contained — nothing can be "orphaned" by a
  master record disappearing.
- The tradeoff: if a movie's real-world title/cover ever needs correcting,
  there's no single place to fix it — you'd need a one-time backfill script
  across existing documents. Considered an acceptable, rare cost.

`Song.js`, `Album.js`, and `Artist.js` models **used to exist** in
`backend/models/` as a leftover attempt at a shared catalog, but were **fully
unused** (zero imports anywhere in the codebase) and were deleted. The actual,
working pattern has always been the embedded-snapshot approach described
above.

## Cinema tracking: Trakt export zip import instead of Trakt OAuth

Originally planned to use Trakt.tv's OAuth API for importing/syncing a user's
existing watchlist and ratings. Dropped because Trakt now requires a paid
"VIP" subscription to register a new OAuth application. Revised approach:

- **Import**: user manually exports their Trakt data via Trakt's account
  settings (a `.zip` containing several JSON files) and uploads it directly
  via `POST /api/cinema/import-trakt` (`parseTraktExport.js` unzips it in
  memory - never written to disk). Only two files are used:
  - `ratings-movies.json` / `ratings-shows.json` → becomes a rated
    `CinemaItem` (`decimalRating`, `isUnrefinedImport: true`).
  - `lists-watchlist-*.json` (can be paginated across multiple numbered
    files) → becomes a watchlist-only `CinemaItem` (`isWatchlist: true`).
  - Everything else in the export (history, collections, episode/season
    ratings via `ratings-episodes.json`/`ratings-seasons.json`, etc.) is
    intentionally ignored to keep scope simple - shows are imported as a
    single top-level entry, no season/episode-level data.
- **No outbound sync** — SoundCheck is the source of truth going forward;
  ratings made here are never pushed back to Trakt.
- **TV episode air-date calendar** (originally planned via Trakt's calendar
  API) will instead be built on top of TMDb's per-show "next episode to air"
  data (`callTmdb.js`), using shows already present in a user's own
  `CinemaItem` watchlist — no Trakt dependency at all.
- Integer ratings from the import are stored as `X.0` with
  `isUnrefinedImport: true`, flagging them for the Phase 4 refinement queue
  where users can adjust them to precise decimals.

## Rate limiting / caching conventions

- External API calls that can be rate-limited (Deezer, TMDb) use a Redis
  sorted-set sliding-window limiter with queueing (see `callDeezer.js` and
  `callTmdb.js` — `callTmdb.js` was written to mirror the existing
  `callDeezer.js` pattern).
- Responses that are expensive/rate-limited but don't change often are cached
  in Redis with a TTL (e.g. TMDb details cached 7 days, TMDb search 2 hours,
  OMDb IMDb stats 24 hours).
