const axios = require("axios");
const redis = require("../utils/redisClient");
const { fetchWithRetry } = require("../utils/fetchWithRetry");
const { getTmdbDetails, getTmdbDetailsForCalendar, searchTmdb, getGenreMap, getTmdbPersonDetails, getTmdbPopularActors, getTmdbTrending, getTmdbSeasonDetails } = require("../utils/callTmdb");
const { getLocalImdbRating } = require("../utils/imdbRatingsSync");
const {
  getCachedEpisodeMap,
  cacheEpisodeMap,
  cacheEmptyResult,
  acquireScanLock,
  releaseScanLock,
  scanImdbEpisodeFile,
  mergeRatingsIntoEpisodes,
  mapTmdbStatusToShowStatus,
} = require("../utils/imdbEpisodeMap");
const { getPersonWikipediaPopularity } = require("../utils/wikipediaPopularity");
const { parseTraktExport } = require("../utils/parseTraktExport");
const { backfillCinemaCovers } = require("../scripts/backfillCinemaCovers");
const { getMediaCanonicalId } = require("../utils/canonical-id");
const CinemaItem = require("../models/CinemaItem");
const User = require("../models/User");

const IMDB_STATS_CACHE_TTL = 86400; // 24h
const CALENDAR_RESPONSE_CACHE_TTL = 86400; // 24h safety-net TTL - actual invalidation is calendar-day based, see getLocalDateString
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/original"; // matches backfillCinemaCovers.js
exports.TMDB_IMAGE_BASE = TMDB_IMAGE_BASE;
const CALENDAR_CACHE_TIMEZONE = "America/Chicago"; // matches server.js cron timezone

// TMDb's top-level release_date is often an earliest-worldwide/festival date,
// not the US theatrical date shown on IMDb - prefer the actual US entry from
// release_dates when available (see getUsOriginalTheatricalRelease below).

// The movie's actual original theatrical release date, ignoring any later
// re-release/reissue (e.g. a 25th-anniversary theatrical re-release) - the
// earliest US "Theatrical limited"/"Theatrical" (type 2/3) entry on record,
// since a reissue can only ever come after the original by definition. Used
// everywhere the title's canonical release date is shown (search, watchlist,
// detail page, calendar, sorting) - a movie whose only US entry is type 2
// with no type 3 at all previously fell back to TMDb's often-inaccurate
// generic top-level release_date instead.
const getUsOriginalTheatricalRelease = (movieDetails) => {
  const usDates = movieDetails?.release_dates?.results?.find((r) => r.iso_3166_1 === "US")?.release_dates || [];
  const earliestTheatrical = usDates
    .filter((d) => d.type === 2 || d.type === 3)
    .sort((a, b) => (a.release_date || "").localeCompare(b.release_date || ""))[0];
  return (earliestTheatrical?.release_date || movieDetails?.release_date)?.slice(0, 10) || null;
};
exports.getUsOriginalTheatricalRelease = getUsOriginalTheatricalRelease;

// The most recent US theatrical re-release date on record, if any - any
// type 2/3 entry that's a different date than the original (rather than
// pattern-matching the note text, which isn't always populated) - drives a
// "Back in Theaters"/"Returning to Theaters" badge for movies like Wet Hot
// American Summer or Akira that get an anniversary reissue.
const getUsRerelease = (movieDetails, originalReleaseDate) => {
  const usDates = movieDetails?.release_dates?.results?.find((r) => r.iso_3166_1 === "US")?.release_dates || [];
  const rereleases = usDates
    .filter((d) => (d.type === 2 || d.type === 3) && d.release_date?.slice(0, 10) !== originalReleaseDate)
    .sort((a, b) => (b.release_date || "").localeCompare(a.release_date || ""));
  return rereleases[0]?.release_date?.slice(0, 10) || null;
};
exports.getUsRerelease = getUsRerelease;

// Whether this movie actually had/has a theatrical run at all (TMDb release
// types: 1=Premiere, 2=Theatrical limited, 3=Theatrical, 4=Digital,
// 5=Physical, 6=TV). Needed because plenty of movies (streaming originals,
// VOD-only releases) never go to theaters - falling back to "no streaming
// platform yet = in theaters" would misclassify those as "In Theaters" when
// they simply haven't been picked up by a major platform we track yet.
const hasTheatricalRelease = (movieDetails) => {
  const usDates = movieDetails?.release_dates?.results?.find((r) => r.iso_3166_1 === "US")?.release_dates;
  return !!usDates?.some((d) => d.type === 2 || d.type === 3);
};
exports.hasTheatricalRelease = hasTheatricalRelease;

// Earliest US "Digital" release date TMDb has on record (type 4), if any -
// lets "in theaters" be dynamic per-movie instead of a fixed day-count guess:
// once this date exists and has passed, the movie has left its exclusive
// theatrical window even if our own streamingPlatforms field hasn't been
// refreshed to reflect it yet.
const getUsDigitalRelease = (movieDetails) => {
  const usDates = movieDetails?.release_dates?.results?.find((r) => r.iso_3166_1 === "US")?.release_dates;
  const digitalDates = usDates?.filter((d) => d.type === 4).map((d) => d.release_date?.slice(0, 10)).filter(Boolean);
  if (!digitalDates?.length) return null;
  return digitalDates.sort()[0];
};
exports.getUsDigitalRelease = getUsDigitalRelease;



// Today's date (YYYY-MM-DD) in a fixed local timezone, so "a new day" lines up
// with the user's expected midnight instead of the server's UTC midnight
const getLocalDateString = (timeZone) =>
  new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());

// Plain Y/M/D calendar math for the "N upcoming releases {this week|this
// month|...}" cascade and month-group headers below - operates on
// "YYYY-MM-DD" strings only (never a raw `new Date(dateString)` parse, which
// would shift by a day in negative-UTC-offset timezones, per the same
// gotcha documented on the frontend's parseLocalDate helpers).
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const parseYmd = (dateStr) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return { y, m, d };
};
const toYmdStr = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const addDaysStr = (dateStr, days) => {
  const { y, m, d } = parseYmd(dateStr);
  const dt = new Date(y, m - 1, d + days);
  return toYmdStr(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
};
const endOfMonthStr = (y, m) => toYmdStr(y, m, new Date(y, m, 0).getDate());
const endOfYearStr = (y) => toYmdStr(y, 12, 31);

// GET /api/cinema/search?query=... (Protected)
// Searches movies/shows via TMDb's /search/multi, filtered down to just
// movie/tv results (no "person" entries) and mapped to a clean shape.
exports.searchCinema = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || !query.trim()) {
      return res.status(400).json({ success: false, message: "query is required" });
    }

    const [data, movieGenres, tvGenres] = await Promise.all([
      searchTmdb(query.trim()),
      getGenreMap("movie"),
      getGenreMap("tv"),
    ]);

    const results = (data?.results || [])
      .filter((r) => r.media_type === "movie" || r.media_type === "tv")
      .map((r) => {
        const genreMap = r.media_type === "movie" ? movieGenres : tvGenres;
        return {
          tmdbId: r.id.toString(),
          mediaType: r.media_type,
          title: r.title || r.name,
          cover: r.poster_path ? `${TMDB_IMAGE_BASE}${r.poster_path}` : null,
          releaseDate: r.release_date || r.first_air_date || null,
          genres: (r.genre_ids || []).map((id) => genreMap[id]).filter(Boolean),
        };
      });

    // TV shows only get a start year from /search/multi (no last_air_date there) -
    // fetch full details (cached 7 days via getTmdbDetails) just for the TV
    // results so we can show a real "2008-2013"/"2008-Present" year range.
    const tvResults = results.filter((r) => r.mediaType === "tv");
    if (tvResults.length > 0) {
      const tvDetails = await Promise.all(
        tvResults.map((r) => getTmdbDetails(r.tmdbId, "tv").catch(() => null))
      );

      tvResults.forEach((r, i) => {
        const details = tvDetails[i];
        if (!details) return;

        const startYear = r.releaseDate ? new Date(r.releaseDate).getFullYear() : null;
        const endYear = details.last_air_date ? new Date(details.last_air_date).getFullYear() : null;
        if (!startYear) return;

        const hasEnded = details.status === "Ended" || details.status === "Canceled";
        if (hasEnded) {
          r.releaseYearRange = endYear && endYear !== startYear ? `${startYear}-${endYear}` : `${startYear}`;
        } else if (endYear && endYear !== startYear) {
          r.releaseYearRange = `${startYear}-Present`;
        }
        // Free - already have the full details object fetched above for the year range.
        if (details.number_of_seasons) {
          r.numberOfSeasons = details.number_of_seasons;
        }
        // Free too - drives the "New Episode"/"Airing Soon"/"New Season Soon" badge client-side.
        r.lastEpisodeAirDate = details.last_episode_to_air?.air_date || null;
        r.nextEpisodeAirDate = details.next_episode_to_air?.air_date || null;
        r.nextEpisodeNumber = details.next_episode_to_air?.episode_number ?? null;
      });
    }

    // Movies need their own details call (release_dates isn't in /search/multi)
    // to know about a later theatrical reissue - mirrors the TV block above so
    // watchlist and search show the exact same "Back in Theaters"/"Returning
    // to Theaters" badge, and also corrects the release year for the rare
    // title whose only US theatrical entry on record is itself a reissue.
    // Also drives the "In Theaters"/"New Release" badge (see movie-release-badge.ts).
    const movieResults = results.filter((r) => r.mediaType === "movie");
    if (movieResults.length > 0) {
      const movieDetailsList = await Promise.all(
        movieResults.map((r) => getTmdbDetails(r.tmdbId, "movie").catch(() => null))
      );

      movieResults.forEach((r, i) => {
        const details = movieDetailsList[i];
        if (!details) return;

        const originalReleaseDate = getUsOriginalTheatricalRelease(details);
        if (originalReleaseDate) {
          r.releaseDate = originalReleaseDate;
        }
        r.rereleaseDate = getUsRerelease(details, originalReleaseDate);
        r.hadTheatricalRelease = hasTheatricalRelease(details);
        r.digitalReleaseDate = getUsDigitalRelease(details);
        r.hasStreamingAvailability = !!buildWatchProviders(details["watch/providers"]?.results?.US?.flatrate).length;
      });
    }

    res.status(200).json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

// GET /api/cinema/trending?mediaType=movie|tv (Protected)
// Powers the cinema marquee (mirrors the music marquee's role, but no cron
// needed - TMDb's /trending/week is already pre-ranked, getTmdbTrending just
// caches the raw call). Filters out near-zero-vote noise, sorts by raw
// `popularity` descending (TMDb's own trending order is NOT the same as
// popularity order - verified directly against the API), and maps to the
// same lean shape searchCinema uses.
//
// Also enriches every item with the same status-badge fields searchCinema
// adds (hadTheatricalRelease/digitalReleaseDate/hasStreamingAvailability for
// movies, lastEpisodeAirDate/nextEpisodeAirDate/nextEpisodeNumber for TV) so
// the marquee card badges (In Theaters/New Release/Coming Soon/New Episode)
// match the rest of the app instead of just showing a generic label. The
// FINAL enriched+filtered list is cached 24h (same as getTmdbTrending's own
// cache) under its own key so the ~50-80 getTmdbDetails calls only happen
// once/day, not on every request - each is already individually cached 7
// days via getTmdbDetails too, so this is a small, bounded, TTL'd addition.
const TRENDING_MIN_VOTE_COUNT = 15;
const TRENDING_ENRICHED_CACHE_TTL = 86400; // 24h
const TRENDING_RESULT_LIMIT = 50; // true top 50 by popularity, numbered 1-50 on the frontend

exports.getCinemaTrending = async (req, res) => {
  try {
    const mediaType = req.query.mediaType === "tv" ? "tv" : "movie";
    const cacheKey = `cinema:trending-enriched:${mediaType}`;

    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.status(200).json({ success: true, data: JSON.parse(cached) });
    }

    const [rawResults, genreMap] = await Promise.all([
      getTmdbTrending(mediaType),
      getGenreMap(mediaType),
    ]);

    const results = rawResults
      .filter((r) => (r.vote_count || 0) >= TRENDING_MIN_VOTE_COUNT)
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, TRENDING_RESULT_LIMIT)
      .map((r) => ({
        tmdbId: r.id.toString(),
        mediaType,
        title: r.title || r.name,
        cover: r.poster_path ? `${TMDB_IMAGE_BASE}${r.poster_path}` : null,
        releaseDate: r.release_date || r.first_air_date || null,
        genres: (r.genre_ids || []).map((id) => genreMap[id]).filter(Boolean),
        voteAverage: r.vote_average || null,
      }));

    const detailsList = await Promise.all(
      results.map((r) => getTmdbDetails(r.tmdbId, mediaType).catch(() => null))
    );

    results.forEach((r, i) => {
      const details = detailsList[i];
      if (!details) return;

      if (mediaType === "movie") {
        const originalReleaseDate = getUsOriginalTheatricalRelease(details);
        if (originalReleaseDate) r.releaseDate = originalReleaseDate;
        r.rereleaseDate = getUsRerelease(details, originalReleaseDate);
        r.hadTheatricalRelease = hasTheatricalRelease(details);
        r.digitalReleaseDate = getUsDigitalRelease(details);
        r.hasStreamingAvailability = !!buildWatchProviders(details["watch/providers"]?.results?.US?.flatrate).length;
      } else {
        r.lastEpisodeAirDate = details.last_episode_to_air?.air_date || null;
        r.nextEpisodeAirDate = details.next_episode_to_air?.air_date || null;
        r.nextEpisodeNumber = details.next_episode_to_air?.episode_number ?? null;
      }
    });

    await redis.set(cacheKey, JSON.stringify(results), "EX", TRENDING_ENRICHED_CACHE_TTL);

    res.status(200).json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};


// Upcoming (default): next episode to air for tracked TV shows (watchlisted
// OR already reviewed, so a show doesn't disappear once you've reviewed an
// earlier season), plus watchlisted movies with a release date today or
// later. Sorted soonest-first.
// Past: the most recently aired episode for tracked TV shows, plus
// watchlisted movies already released. Sorted most-recent-first.
//
// Dates are compared as plain "YYYY-MM-DD" strings (not `new Date(...) < now`)
// on purpose - `new Date("2026-09-04")` parses as UTC midnight, which for any
// timezone behind UTC (e.g. America/Chicago) is already several hours in the
// past by the time it's actually today in that timezone, so a naive
// timestamp comparison incorrectly drops/moves items releasing "today".

// Deletes (not just marks stale) a user's cached calendar so their next
// load rebuilds from scratch - called on any watchlist/watched/rating
// change instead of leaving the old list to linger until the calendar-day
// rollover or a manual refresh tap. Cheap either way: the rebuild reuses
// each title's own already-cached TMDb data, it just re-runs the (fast)
// CinemaItem query and re-derives the entries.
async function invalidateCalendarCache(userId) {
  await Promise.all([
    redis.del(`calendar:${userId}:upcoming`),
    redis.del(`calendar:${userId}:past`),
  ]).catch(() => {});
}

// Builds the calendar page's dynamic subtitle ("N upcoming releases this
// week" etc, cascading through progressively wider windows) and the
// per-month release counts the UI's month-group headers need - computed
// over the full (already date-filtered/sorted, mediaType-filtered) entry
// list, NOT just whichever page is being returned, so both stay accurate
// even before every item in a given window/month has actually been paged in.
// Cascade: this week -> last/next week -> this month -> this year -> total.
// Direction flips for 'past' (last week/this month-so-far/this year-so-far
// instead of next week/rest-of-month/rest-of-year). Checking wider windows
// costs nothing extra (same in-memory array, no additional TMDb/Mongo
// calls), so there's no reason not to cascade all the way to a year.
function buildCalendarSubtitle(entries, range, todayStr) {
  const { y, m } = parseYmd(todayStr);
  const isUpcoming = range !== "past";

  const windows = isUpcoming
    ? [
        { period: "this-week", start: todayStr, end: addDaysStr(todayStr, 6) },
        { period: "next-week", start: addDaysStr(todayStr, 7), end: addDaysStr(todayStr, 13) },
        { period: "this-month", start: todayStr, end: endOfMonthStr(y, m) },
        { period: "this-year", start: todayStr, end: endOfYearStr(y) },
      ]
    : [
        { period: "this-week", start: addDaysStr(todayStr, -6), end: todayStr },
        { period: "last-week", start: addDaysStr(todayStr, -13), end: addDaysStr(todayStr, -7) },
        { period: "this-month", start: toYmdStr(y, m, 1), end: todayStr },
        { period: "this-year", start: toYmdStr(y, 1, 1), end: todayStr },
      ];

  for (const w of windows) {
    const count = entries.filter((e) => e.airDate >= w.start && e.airDate <= w.end).length;
    if (count > 0) return { count, period: w.period };
  }

  return { count: entries.length, period: "all" };
}

function buildCalendarMonthGroups(entries) {
  const counts = new Map();
  for (const e of entries) {
    const key = e.airDate.slice(0, 7); // "YYYY-MM"
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries()).map(([key, count]) => {
    const [y, m] = key.split("-").map(Number);
    return { key, label: `${MONTH_NAMES[m - 1]} ${y}`, count };
  });
}

exports.getCalendar = async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const range = req.query.range === "past" ? "past" : "upcoming";
    const mediaTypeFilter = ["tv", "movie"].includes(req.query.mediaType) ? req.query.mediaType : "all";
    const cacheKey = `calendar:${req.user._id}:${range}`;
    const todayStr = getLocalDateString(CALENDAR_CACHE_TIMEZONE);

    // Offset/limit (not the cursorDate/cursorId pattern used by getWatchlist)
    // because the sort field here (episode air date / release date) isn't a
    // stored Mongo field - it only exists after live TMDb calls resolve for
    // every tracked item, so the full list has to be computed+sorted before
    // any pagination can happen at all. That full list is already cached for
    // the day below, so slicing it per-page is cheap - this only limits how
    // much of it any single response actually sends/renders.
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    // The outer cache always stores the full, unfiltered (both media types)
    // list - mediaType filtering happens here, per-request, on whichever
    // array (cached or freshly computed) is in hand, so a filter change
    // never needs its own separate cache entry/TMDb refetch.
    const buildPage = (calendar) => {
      const filtered = mediaTypeFilter === "all" ? calendar : calendar.filter((e) => e.mediaType === mediaTypeFilter);
      return {
        data: filtered.slice(offset, offset + limit),
        hasMore: offset + limit < filtered.length,
        total: filtered.length,
        subtitle: buildCalendarSubtitle(filtered, range, todayStr),
        monthGroups: buildCalendarMonthGroups(filtered),
      };
    };

    if (!forceRefresh) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        // One fresh call per calendar day, not a rolling 24h window - stale
        // as soon as the date rolls over, even if it's only been a minute
        if (parsed.cachedDate === todayStr) {
          return res.status(200).json({ success: true, ...buildPage(parsed.data) });
        }
      }
    }

    const items = await CinemaItem.find({
      user: req.user._id,
      tmdbId: { $exists: true, $ne: null },
      $or: [{ isWatchlist: true }, { isWatched: true }],
    });

    const tvItems = items.filter((i) => i.mediaType === "tv");
    const movieItems = items.filter((i) => i.mediaType === "movie" && i.isWatchlist);

    // forceRefresh only bypasses the outer per-user calendar cache above (so
    // newly added/removed watchlist items show up immediately) - it does NOT
    // force every individual item to hit TMDb live. Each item's own TMDb
    // details already refresh themselves every 3 days on their own, and with
    // a large watchlist, forcing hundreds of live calls at once (rate-limited
    // to 40/sec, each with retry/backoff) is what was making refresh take ~20s.
    //
    // A failed item is still just omitted from this response (not a 500) -
    // but hadFetchError is tracked separately so the outer cache write below
    // can be skipped, instead of baking a genuinely-transient TMDb failure
    // into an incomplete calendar for the rest of the day.
    let hadFetchError = false;
    const safeGetDetails = (tmdbId, mediaType) =>
      getTmdbDetailsForCalendar(tmdbId, mediaType).catch((err) => {
        hadFetchError = true;
        console.error(`Calendar item fetch failed [${mediaType}/${tmdbId}]:`, err.message);
        return null;
      });

    const [tvDetails, movieDetails] = await Promise.all([
      Promise.all(tvItems.map((i) => safeGetDetails(i.tmdbId, "tv"))),
      Promise.all(movieItems.map((i) => safeGetDetails(i.tmdbId, "movie"))),
    ]);

    const tvEntries = tvItems
      .map((item, i) => {
        const episode =
          range === "past" ? tvDetails[i]?.last_episode_to_air : tvDetails[i]?.next_episode_to_air;
        const airDate = episode?.air_date?.slice(0, 10);
        if (!airDate) return null;
        if (range === "upcoming" && airDate < todayStr) return null;
        if (range === "past" && airDate >= todayStr) return null;
        return {
          _id: item._id,
          tmdbId: item.tmdbId,
          mediaType: "tv",
          title: item.title,
          cover: item.cover,
          airDate,
          seasonNumber: episode.season_number,
          episodeNumber: episode.episode_number,
          episodeName: episode.name,
          isWatchlist: item.isWatchlist,
          decimalRating: item.decimalRating,
          reviewText: item.reviewText,
          isUnrefinedImport: item.isUnrefinedImport,
        };
      })
      .filter(Boolean);

    const movieEntries = movieItems
      .map((item, i) => {
        const details = movieDetails[i];
        if (!details) return null;

        // Mirrors getUsOriginalTheatricalRelease/getUsRerelease used
        // everywhere else (search/watchlist/detail) instead of the old
        // "first type-3 entry, else generic top-level release_date"
        // fallback, which could disagree with the canonical US date (e.g.
        // a movie whose only US entry is type 2 "Theatrical limited" with
        // no type 3 at all would fall back to TMDb's often-earlier generic
        // worldwide release_date instead of the actual US date).
        const originalReleaseDate = getUsOriginalTheatricalRelease(details);
        if (!originalReleaseDate) return null;
        const rereleaseDate = getUsRerelease(details, originalReleaseDate);

        // Pick whichever theatrical event (original or a later reissue) is
        // actually the relevant one for the requested range.
        const candidates = [originalReleaseDate, rereleaseDate].filter(Boolean);
        const releaseDate =
          range === "upcoming"
            ? candidates.filter((d) => d >= todayStr).sort()[0]
            : candidates.filter((d) => d < todayStr).sort().reverse()[0];
        if (!releaseDate) return null;

        const isRerelease = releaseDate === rereleaseDate && rereleaseDate !== originalReleaseDate;

        return {
          _id: item._id,
          tmdbId: item.tmdbId,
          mediaType: "movie",
          title: item.title,
          cover: item.cover,
          airDate: releaseDate,
          isRerelease,
          isWatchlist: item.isWatchlist,
          decimalRating: item.decimalRating,
          reviewText: item.reviewText,
          isUnrefinedImport: item.isUnrefinedImport,
        };
      })
      .filter(Boolean);

    const calendar = [...tvEntries, ...movieEntries].sort((a, b) =>
      range === "past" ? b.airDate.localeCompare(a.airDate) : a.airDate.localeCompare(b.airDate)
    );

    // Skip caching when any item failed to fetch - otherwise a transient
    // TMDb blip would get baked into an incomplete calendar for the rest of
    // the day (see hadFetchError above). The client still gets today's best
    // effort list; the next load just tries the failed item(s) again live.
    if (!hadFetchError) {
      await redis.set(cacheKey, JSON.stringify({ cachedDate: todayStr, data: calendar }), "EX", CALENDAR_RESPONSE_CACHE_TTL);
    }

    res.status(200).json({ success: true, ...buildPage(calendar) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

// GET /api/cinema/imdb-stats/:imdbId
// Fetches IMDb community rating/vote count from our locally-synced dataset
// (see utils/imdbRatingsSync.js) plus Awards/BoxOffice from OMDb (the ratings
// dataset doesn't include those fields).
exports.getImdbStats = async (req, res) => {
  try {
    const { imdbId } = req.params;

    if (!imdbId || !/^tt\d+$/.test(imdbId)) {
      return res.status(400).json({ success: false, message: "Invalid imdbId" });
    }

    const [localRating, omdbData] = await Promise.all([
      getLocalImdbRating(imdbId),
      fetchOmdbData(imdbId).catch(() => null),
    ]);

    if (!localRating && !omdbData) {
      return res.status(404).json({ success: false, message: "Title not found" });
    }

    res.status(200).json({
      success: true,
      data: {
        imdbId,
        imdbRating: localRating?.imdbRating ?? null,
        voteCount: localRating?.voteCount ?? null,
        awardsRaw: omdbData?.awardsRaw ?? null,
        boxOfficeUs: omdbData?.boxOfficeUs ?? null,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

// A show's episode list is only ever considered stale (not just present/
// absent) for currently-airing shows, since only those can gain a genuinely
// new episode mapping between now and this key's TTL expiry. Ended shows'
// mappings are complete forever, so they're never proactively refreshed.
const ONGOING_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

function isStale(cachedPayload, showStatus) {
  if (showStatus !== "ongoing") return false;
  const cachedAtMs = new Date(cachedPayload.cachedAt).getTime();
  if (!Number.isFinite(cachedAtMs)) return false;
  return Date.now() - cachedAtMs > ONGOING_STALE_AFTER_MS;
}

// Background refresh/scan - fire-and-forget, never awaited by a request
// handler. Re-acquires the same lock other callers use, so a background
// refresh can never run concurrently with (or duplicate) an on-demand scan
// for the same show.
async function refreshEpisodeMapInBackground(parentTconst, showStatus) {
  const gotLock = await acquireScanLock(parentTconst).catch(() => false);
  if (!gotLock) return;
  try {
    const byParent = await scanImdbEpisodeFile(parentTconst);
    const episodes = byParent.get(parentTconst) || [];
    if (episodes.length) {
      await cacheEpisodeMap(parentTconst, episodes, { showStatus, cacheSource: "coldFallback" });
    } else {
      await cacheEmptyResult(parentTconst);
    }
  } catch (error) {
    console.error(`imdbEpisodeMap: background refresh failed for ${parentTconst}:`, error.message);
  } finally {
    await releaseScanLock(parentTconst).catch(() => {});
  }
}

// Fire-and-forget warm-cache hook - called (never awaited) right after a
// user watchlists, marks watched, or rates/reviews a TV show, so a show they
// just interacted with is likely already cached by the time they open its
// Episodes tab, even if it was never nightly-prewarmed (e.g. just added).
// Purely a performance optimization: correctness still comes from the
// on-demand endpoint's own cold-scan fallback, so this never needs to be
// awaited by the calling request handler.
async function triggerEpisodeMapPrewarmForShow(item) {
  if (!item || item.mediaType !== "tv" || !item.imdbId || !/^tt\d+$/.test(item.imdbId)) return;
  const parentTconst = item.imdbId;

  try {
    const alreadyCached = await getCachedEpisodeMap(parentTconst);
    if (alreadyCached) return; // don't rescan - staleness is handled by the read endpoint

    const gotLock = await acquireScanLock(parentTconst);
    if (!gotLock) return; // a scan for this show is already in flight

    try {
      const showStatus = mapTmdbStatusToShowStatus(item.status);
      const byParent = await scanImdbEpisodeFile(parentTconst);
      const episodes = byParent.get(parentTconst) || [];
      if (episodes.length) {
        await cacheEpisodeMap(parentTconst, episodes, { showStatus, cacheSource: "userActionPrewarm" });
      } else {
        await cacheEmptyResult(parentTconst);
      }
    } finally {
      await releaseScanLock(parentTconst).catch(() => {});
    }
  } catch (error) {
    console.error(`imdbEpisodeMap: user-action prewarm failed for ${parentTconst}:`, error.message);
  }
}

// GET /api/cinema/tv/:parentTconst/episodes/imdb-ratings?showStatus=ended|ongoing
// Per-episode IMDb ratings for a TV show, by its IMDb ID - works for ANY
// show (tracked or a brand-new search result), not just ones already
// prewarmed. See utils/imdbEpisodeMap.js's top-of-file comment and
// /memories/repo/tv-episode-imdb-ratings-plan.md for the full architecture
// (Option A) this implements.
exports.getEpisodeImdbRatings = async (req, res) => {
  try {
    const { parentTconst } = req.params;
    const showStatus = req.query.showStatus === "ended" ? "ended" : req.query.showStatus === "ongoing" ? "ongoing" : "unknown";

    if (!parentTconst || !/^tt\d+$/.test(parentTconst)) {
      return res.status(400).json({ success: false, message: "Invalid parentTconst" });
    }

    const cached = await getCachedEpisodeMap(parentTconst);

    if (cached) {
      const stale = isStale(cached, showStatus);
      if (stale) {
        // Don't block the response on the refresh - return what we have now.
        refreshEpisodeMapInBackground(parentTconst, showStatus);
      }
      const episodes = await mergeRatingsIntoEpisodes(cached.episodes);
      return res.status(200).json({
        success: true,
        data: {
          parentTconst,
          cacheStatus: stale ? "stale" : "hit",
          source: "imdb-title-episode-dataset + imdb-title-ratings-dataset",
          episodes,
        },
      });
    }

    // Cache miss - only one concurrent request per show is ever allowed to
    // actually perform the expensive full-file scan.
    const gotLock = await acquireScanLock(parentTconst);
    if (!gotLock) {
      return res.status(202).json({
        success: true,
        data: {
          parentTconst,
          cacheStatus: "processing",
          message: "Episode ratings are being prepared. Try again shortly.",
        },
      });
    }

    try {
      const byParent = await scanImdbEpisodeFile(parentTconst);
      const episodes = byParent.get(parentTconst) || [];

      if (!episodes.length) {
        await cacheEmptyResult(parentTconst);
        return res.status(200).json({
          success: true,
          data: { parentTconst, cacheStatus: "miss", source: "imdb-title-episode-dataset", episodes: [] },
        });
      }

      await cacheEpisodeMap(parentTconst, episodes, { showStatus, cacheSource: "coldFallback" });
      const merged = await mergeRatingsIntoEpisodes(episodes);
      return res.status(200).json({
        success: true,
        data: {
          parentTconst,
          cacheStatus: "miss",
          source: "imdb-title-episode-dataset + imdb-title-ratings-dataset",
          episodes: merged,
        },
      });
    } finally {
      await releaseScanLock(parentTconst);
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

// Shared OMDb fetch (cached) used by both getImdbStats and getCinemaDetail -
// avoids double-hitting OMDb for the same imdbId across endpoints. Only used
// for Awards/BoxOffice now - rating/vote count come from the local IMDb
// dataset (see utils/imdbRatingsSync.js) instead, which is far fresher.
const fetchOmdbData = async (imdbId) => {
  const cacheKey = `imdb:stats:${imdbId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  if (!process.env.OMDB_API_KEY) {
    throw new Error("OMDb API key not configured");
  }

  const response = await fetchWithRetry(() =>
    axios.get("https://www.omdbapi.com/", {
      params: { i: imdbId, apikey: process.env.OMDB_API_KEY },
      timeout: 7000,
    })
  );

  const omdbData = response.data;
  if (!omdbData || omdbData.Response === "False") return null;

  const data = {
    awardsRaw: omdbData.Awards && omdbData.Awards !== "N/A" ? omdbData.Awards : null,
    boxOfficeUs: omdbData.BoxOffice && omdbData.BoxOffice !== "N/A" ? omdbData.BoxOffice : null,
  };

  await redis.set(cacheKey, JSON.stringify(data), "EX", IMDB_STATS_CACHE_TTL);
  return data;
};

// Parses OMDb's free-text Awards sentence (e.g. "Won 2 Oscars. 163 wins & 165
// nominations total") down to a short pill-friendly summary like "2 Oscars ·
// 163 wins". No structured/category-level award data exists in any of our
// sources (OMDb/TMDb) - the raw sentence is kept alongside for a "show more" expand.
const parseAwardsSummary = (awardsRaw) => {
  if (!awardsRaw) return null;

  const oscarMatch = awardsRaw.match(/(Won|Nominated for)\s+(\d+)\s+Oscars?/i);
  const winsMatch = awardsRaw.match(/(\d+)\s+wins?/i);

  const parts = [];
  if (oscarMatch) {
    const count = oscarMatch[2];
    const verb = oscarMatch[1].toLowerCase() === "won" ? "Oscar" : "Oscar nom";
    parts.push(`${count} ${verb}${count === "1" ? "" : "s"}`);
  }
  if (winsMatch) {
    const count = winsMatch[1];
    parts.push(`${count} win${count === "1" ? "" : "s"}`);
  }

  return parts.length ? parts.join(" · ") : awardsRaw;
};

// Phase 1 awards stat tiles - best-effort parse of the same OMDb sentence,
// pulled apart into the numbers the Awards page's stat card shows. OMDb's
// wording isn't perfectly consistent across titles, so any figure not found
// in the sentence is left null rather than guessed - the frontend hides
// individual stat tiles it doesn't have data for instead of showing a
// misleading "0". Emmy wins/noms are movie type-specific (Oscars don't apply
// to TV, Emmys don't apply to movies) since a title's mediaType tells us
// which one is actually relevant to look for.
const parseAwardsStats = (awardsRaw, mediaType) => {
  if (!awardsRaw) return null;

  const oscarWinMatch = mediaType === "movie" ? awardsRaw.match(/Won\s+(\d+)\s+Oscars?/i) : null;
  const emmyWinMatch = mediaType === "tv" ? awardsRaw.match(/Won\s+(\d+)\s+Primetime Emmys?/i) : null;
  const emmyNominationMatch =
    mediaType === "tv" ? awardsRaw.match(/Nominated for\s+(\d+)\s+Primetime Emmys?/i) : null;
  const winsMatch = awardsRaw.match(/(\d+)\s+wins?/i);
  const nominationsMatch = awardsRaw.match(/(\d+)\s+nominations?/i);

  const oscarWins = oscarWinMatch ? Number(oscarWinMatch[1]) : null;
  const emmyWins = emmyWinMatch ? Number(emmyWinMatch[1]) : null;
  const emmyNominations = emmyNominationMatch ? Number(emmyNominationMatch[1]) : null;
  const otherWins = winsMatch ? Number(winsMatch[1]) : null;
  const nominations = nominationsMatch ? Number(nominationsMatch[1]) : null;

  if (
    oscarWins == null &&
    emmyWins == null &&
    emmyNominations == null &&
    otherWins == null &&
    nominations == null
  ) {
    return null;
  }
  return { oscarWins, emmyWins, emmyNominations, otherWins, nominations };
};

// Abbreviates a raw dollar amount (number or "$1,234,567" string) to e.g. "$1.0B"/"$535M"
const abbreviateMoney = (value) => {
  const amount = typeof value === "string" ? Number(value.replace(/[^0-9.]/g, "")) : value;
  if (!amount || Number.isNaN(amount)) return null;

  if (amount >= 1e9) return `$${(amount / 1e9).toFixed(1)}B`;
  if (amount >= 1e6) return `$${(amount / 1e6).toFixed(0)}M`;
  if (amount >= 1e3) return `$${(amount / 1e3).toFixed(0)}K`;
  return `$${amount}`;
};

// Combines OMDb's US box office with TMDb's worldwide revenue into one label
const formatBoxOffice = (usBoxOffice, worldwideRevenue) => {
  const parts = [];
  const us = abbreviateMoney(usBoxOffice);
  const worldwide = abbreviateMoney(worldwideRevenue);
  if (us) parts.push(`${us} US`);
  if (worldwide) parts.push(`${worldwide} worldwide`);
  return parts.length ? parts.join(" · ") : null;
};

// Curated allow-list of major streaming providers - TMDb/JustWatch's raw list
// includes noisy add-on/channel entries (e.g. "HBO Max Amazon Channel", "TNT",
// "tru TV") that don't match the clean short list users expect to see.
const MAJOR_WATCH_PROVIDERS = new Set([
  "Netflix",
  "Max",
  "HBO Max",
  "Disney Plus",
  "Hulu",
  "Amazon Prime Video",
  "Prime Video",
  "Apple TV",
  "Apple TV Plus",
  "Paramount Plus",
  "Peacock",
  "YouTube",
  "Google Play Movies",
  "Vudu",
  "Fandango At Home",
  "fuboTV",
  "Starz",
  "Showtime",
  "AMC+",
  "Crunchyroll",
  "ESPN Plus",
  "Tubi",
  "Pluto TV",
  "MGM Plus",
  "Discovery Plus",
  "Discovery+",
  "BritBox",
  "Acorn TV",
  "Shudder",
  "MUBI",
  "Criterion Channel",
  "Philo",
  "The Roku Channel",
  "Sling TV Orange",
  "Sling TV Orange and Blue",
  "YouTube TV",
]);

// Strips "... Amazon Channel" / "... Roku Premium Channel" style suffixes TMDb
// uses for bundled add-on listings, so e.g. "HBO Max Amazon Channel" dedupes
// against a plain "HBO Max" entry instead of showing as a separate tile.
const CHANNEL_SUFFIX_RE = /\s+(Amazon Channel|Roku Premium Channel|Apple TV Channel|Channel)$/i;
const normalizeProviderName = (name) => name.replace(CHANNEL_SUFFIX_RE, "").trim();

// Tile renders at 76px but pull the max source resolution TMDb offers so
// logos stay crisp on any display density.
const TMDB_PROVIDER_LOGO_BASE = "https://image.tmdb.org/t/p/original";

const buildWatchProviders = (flatrateProviders) => {
  if (!Array.isArray(flatrateProviders)) return [];

  const seen = new Map();
  for (const provider of flatrateProviders) {
    const rawName = provider.provider_name || "";
    const normalizedName = normalizeProviderName(rawName);
    if (!MAJOR_WATCH_PROVIDERS.has(normalizedName)) continue;

    // TMDb often lists both a clean canonical entry ("HBO Max") and a
    // bundled "channel" add-on entry ("HBO Max Amazon Channel") for the same
    // platform - the channel variant's logo is a composited "X on Y" badge,
    // not the plain brand mark, so always prefer the canonical one if seen.
    const isCanonical = !CHANNEL_SUFFIX_RE.test(rawName);
    const existing = seen.get(normalizedName);
    if (existing && (existing.isCanonical || !isCanonical)) continue;

    seen.set(normalizedName, {
      name: normalizedName,
      logoUrl: provider.logo_path ? `${TMDB_PROVIDER_LOGO_BASE}${provider.logo_path}` : null,
      isCanonical,
    });
  }

  return Array.from(seen.values()).map(({ name, logoUrl }) => ({ name, logoUrl }));
};
exports.buildWatchProviders = buildWatchProviders;

// GET /api/cinema/status/:mediaType/:tmdbId (Protected)
// Whether the current user already has this exact title tracked (watchlist/
// watched/rating), keyed only by tmdbId+mediaType - used when opening a
// detail modal from an untracked context (search results) that has no real
// CinemaItem _id yet, so the modal doesn't wrongly show "Add to Watchlist"
// for something already on the user's watchlist.
exports.getCinemaItemStatus = async (req, res) => {
  try {
    const { mediaType, tmdbId } = req.params;
    const item = await CinemaItem.findOne({ user: req.user._id, mediaType, tmdbId });
    res.status(200).json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

// GET /api/cinema/detail/:mediaType/:tmdbId (Protected)
// Consolidated payload for the cinema review detail page: TMDb metadata +
// credits + watch providers, plus OMDb-derived IMDb rating/awards/box office.
exports.getCinemaDetail = async (req, res) => {
  try {
    const { mediaType, tmdbId } = req.params;
    if (mediaType !== "movie" && mediaType !== "tv") {
      return res.status(400).json({ success: false, message: "mediaType must be 'movie' or 'tv'" });
    }

    const details = await getTmdbDetails(tmdbId, mediaType);
    if (!details) {
      return res.status(404).json({ success: false, message: "Title not found" });
    }

    const genreMap = await getGenreMap(mediaType);

    // "Similar" tab - TMDb's own recommendation engine (generally more
    // relevant than its separate "similar" endpoint, which is more literal
    // genre/keyword matching per TMDb's own docs). Capped at 15; each result
    // only has `media_type` when it comes from a multi-search, not here, so
    // it's assumed to match the source title's mediaType (recommendations
    // are always same-type - a movie's recommendations are always movies).
    const SIMILAR_LIMIT = 15;
    const similar = (details.recommendations?.results || [])
      .slice(0, SIMILAR_LIMIT)
      .map((r) => ({
        tmdbId: String(r.id),
        mediaType,
        title: r.title || r.name,
        cover: r.poster_path ? `${TMDB_IMAGE_BASE}${r.poster_path}` : null,
        releaseDate: r.release_date || r.first_air_date || null,
        genres: (r.genre_ids || []).map((id) => genreMap[id]).filter(Boolean),
      }));

    const director = details.credits?.crew?.find((c) => c.job === "Director")?.name || null;
    // Full cast list, no cap (the frontend's "View full cast" screen is a
    // plain scrollable list). Movies: TMDb's plain credits.cast is already
    // the full film cast, ordered by billing. TV: the plain "credits" field
    // only covers the CURRENT season, so aggregate_credits (merged across
    // every season/episode) is used instead - its cast entries nest
    // character(s) under "roles" rather than a flat "character" field.
    // order/popularity passed through as-is (real TMDb fields) so the
    // frontend can offer Credit Order/Popularity sort without extra calls.
    const cast =
      mediaType === "tv"
        ? (details.aggregate_credits?.cast || []).map((c) => ({
            personId: c.id,
            name: c.name,
            character: c.roles?.[0]?.character || "",
            profilePath: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : null,
            order: c.order,
            popularity: c.popularity,
          }))
        : (details.credits?.cast || []).map((c) => ({
            personId: c.id,
            name: c.name,
            character: c.character,
            profilePath: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : null,
            order: c.order,
            popularity: c.popularity,
          }));

    // Detail page shows the title's canonical release date (not a later
    // reissue), so use the original-release helper here - isRerelease is
    // only meaningful for the calendar's "next theatrical event" concept.
    const releaseDate =
      mediaType === "movie" ? getUsOriginalTheatricalRelease(details) : details.first_air_date || null;

    // Movie only - a later theatrical reissue (e.g. an anniversary
    // re-release), if TMDb has one on record. Drives "Back in Theaters"/
    // "Returning to Theaters" client-side.
    const rereleaseDate = mediaType === "movie" ? getUsRerelease(details, releaseDate) : null;

    // Movie only - drives the "In Theaters"/"New Release" badge client-side
    // (see movie-release-badge.ts) alongside watchProviders below.
    const hadTheatricalReleaseValue = mediaType === "movie" ? hasTheatricalRelease(details) : false;
    const digitalReleaseDate = mediaType === "movie" ? getUsDigitalRelease(details) : null;


    // TV only - "2016-2025"/"2023-Present" style range shown instead of a
    // single year (mirrors the same logic already used for watchlist rows/
    // fetchCinemaMetadata, just inlined here since getCinemaDetail doesn't
    // go through that helper).
    let releaseYearRange = null;
    if (mediaType === "tv" && releaseDate) {
      const startYear = new Date(releaseDate).getFullYear();
      const endYear = details.last_air_date ? new Date(details.last_air_date).getFullYear() : null;
      const hasEnded = details.status === "Ended" || details.status === "Canceled";
      if (hasEnded) {
        releaseYearRange = endYear && endYear !== startYear ? `${startYear}-${endYear}` : `${startYear}`;
      } else {
        releaseYearRange = endYear && endYear !== startYear ? `${startYear}-Present` : `${startYear}`;
      }
    }

    const certification =
      mediaType === "movie"
        ? details.release_dates?.results?.find((r) => r.iso_3166_1 === "US")?.release_dates?.find(
            (d) => d.type === 3
          )?.certification || null
        : null;

    // Movies have imdb_id natively; TV only exposes it via external_ids.
    const imdbId = details.imdb_id || details.external_ids?.imdb_id || null;

    const [omdbData, localRating] = await Promise.all([
      imdbId ? fetchOmdbData(imdbId).catch(() => null) : Promise.resolve(null),
      getLocalImdbRating(imdbId).catch(() => null),
    ]);

    const watchProviders = buildWatchProviders(
      details["watch/providers"]?.results?.US?.flatrate
    );

    // Extra images beyond the main poster (alternate posters + backdrops) -
    // powers the "More images" gallery on the detail page. Capped since a
    // popular title can have 100+ of each; ordered by TMDb's own
    // vote_average (its "best first" ranking for images).
    const IMAGE_GALLERY_LIMIT = 20;
    const toImageUrl = (path) => `${TMDB_IMAGE_BASE}${path}`;
    const images = {
      backdrops: (details.images?.backdrops || [])
        .slice(0, IMAGE_GALLERY_LIMIT)
        .map((img) => toImageUrl(img.file_path)),
      posters: (details.images?.posters || [])
        .slice(0, IMAGE_GALLERY_LIMIT)
        .map((img) => toImageUrl(img.file_path)),
    };

    // Trailer - prefer an official YouTube "Trailer" (newest first, TMDb
    // doesn't guarantee order), fall back to any YouTube "Teaser" if no
    // proper trailer is on record yet (common for unreleased titles).
    const videos = details.videos?.results || [];
    const youtubeTrailers = videos.filter((v) => v.site === "YouTube" && v.type === "Trailer");
    const youtubeTeasers = videos.filter((v) => v.site === "YouTube" && v.type === "Teaser");
    const bestVideo =
      youtubeTrailers.find((v) => v.official) ||
      youtubeTrailers[0] ||
      youtubeTeasers.find((v) => v.official) ||
      youtubeTeasers[0] ||
      null;
    const trailerKey = bestVideo?.key || null;

    res.status(200).json({
      success: true,
      data: {
        tmdbId,
        mediaType,
        imdbId,
        title: details.title || details.name,
        cover: details.poster_path ? `${TMDB_IMAGE_BASE}${details.poster_path}` : null,
        year: releaseDate ? Number(releaseDate.slice(0, 4)) : null,
        releaseYearRange,
        releaseDate,
        rereleaseDate,
        hadTheatricalRelease: hadTheatricalReleaseValue,
        digitalReleaseDate,
        // TMDb's production status ("In Production", "Post Production",
        // "Planned", "Released", "Ended", "Returning Series", etc) - shown
        // instead of a release date for titles that don't have one yet.
        status: details.status || null,
        // TV only - drives the "New Episode"/"Airing Soon"/"New Season Soon" badge.
        lastEpisodeAirDate: mediaType === "tv" ? details.last_episode_to_air?.air_date || null : null,
        nextEpisodeAirDate: mediaType === "tv" ? details.next_episode_to_air?.air_date || null : null,
        nextEpisodeNumber: mediaType === "tv" ? details.next_episode_to_air?.episode_number ?? null : null,
        numberOfSeasons: mediaType === "tv" ? details.number_of_seasons || null : null,
        runtimeMinutes: details.runtime || details.episode_run_time?.[0] || null,
        certification,
        genres: (details.genres || []).map((g) => g.name),
        description: details.overview || null,
        director,
        cast,
        awardsRaw: omdbData?.awardsRaw || null,
        awardsSummary: parseAwardsSummary(omdbData?.awardsRaw),
        awardsStats: parseAwardsStats(omdbData?.awardsRaw, mediaType),
        boxOffice: formatBoxOffice(omdbData?.boxOfficeUs, details.revenue),
        budget: mediaType === "movie" ? abbreviateMoney(details.budget) : null,
        imdbRating: localRating?.imdbRating ?? null,
        imdbVoteCount: localRating?.voteCount ?? null,
        watchProviders,
        images,
        trailerKey,
        similar,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

// GET /api/cinema/tv/:tmdbId/season/:seasonNumber (Protected)
// Episode name/overview/air date/still image for one season, TMDb-sourced -
// paired client-side with getEpisodeImdbRatings (matched by season+episode
// number) since neither IMDb dataset has this metadata. Also merges in the
// current user's own per-episode watched/rating state (if this show is
// tracked at all) so the episode detail page can show "already watched"/
// pre-fill a rating without a separate round-trip.
exports.getTvSeasonEpisodes = async (req, res) => {
  try {
    const { tmdbId, seasonNumber } = req.params;
    const season = await getTmdbSeasonDetails(tmdbId, seasonNumber);
    if (!season) {
      return res.status(404).json({ success: false, message: "Season not found" });
    }

    const item = await CinemaItem.findOne({ user: req.user._id, mediaType: "tv", tmdbId });
    const seasonNum = Number(seasonNumber);
    const reviewsByEpisode = new Map(
      (item?.episodeReviews || [])
        .filter((r) => r.seasonNumber === seasonNum)
        .map((r) => [r.episodeNumber, r])
    );

    res.status(200).json({
      success: true,
      data: {
        ...season,
        posterUrl: season.posterPath ? `${TMDB_IMAGE_BASE}${season.posterPath}` : null,
        episodes: season.episodes.map((e) => {
          const myReview = reviewsByEpisode.get(e.episodeNumber);
          return {
            ...e,
            myReview: myReview
              ? {
                  isWatched: myReview.isWatched,
                  decimalRating: myReview.decimalRating ?? null,
                  reviewText: myReview.reviewText ?? null,
                  containsSpoilers: myReview.containsSpoilers ?? false,
                }
              : null,
          };
        }),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

// Finds-or-creates the CinemaItem tracking a TV show, needed as the storage
// location for an episodeReviews entry even if the user never explicitly
// added the show to their watchlist. Mirrors toggleWatchlist/markCinemaWatched's
// create-if-missing pattern, but never touches the show's own isWatchlist/
// isWatched flags - those stay independent of individual episode activity.
async function findOrCreateShowItem(userId, { tmdbId, title, cover, releaseDate }) {
  let item = await CinemaItem.findOne({ user: userId, tmdbId, mediaType: "tv" });
  if (item) return item;

  const metadata = await fetchCinemaMetadata(tmdbId, "tv");
  return CinemaItem.create({
    user: userId,
    tmdbId,
    mediaType: "tv",
    title,
    cover,
    ...metadata,
    ...(!metadata.releaseDate && releaseDate ? { releaseDate } : {}),
  });
}

// POST /api/cinema/episode/mark-watched (Protected)
// Toggles watched (without a rating) for one specific episode - creates the
// show's CinemaItem if it isn't tracked yet (see findOrCreateShowItem).
exports.markEpisodeWatched = async (req, res) => {
  try {
    const { tmdbId, title, cover, releaseDate, seasonNumber, episodeNumber } = req.body;

    if (!tmdbId || !title || seasonNumber == null || episodeNumber == null) {
      return res.status(400).json({ success: false, message: "tmdbId, title, seasonNumber, and episodeNumber are required" });
    }

    const item = await findOrCreateShowItem(req.user._id, { tmdbId, title, cover, releaseDate });
    const existing = item.episodeReviews.find(
      (r) => r.seasonNumber === seasonNumber && r.episodeNumber === episodeNumber
    );

    if (existing && existing.isWatched) {
      // Undo - drop the entry entirely if there's nothing else worth keeping (no rating).
      if (existing.decimalRating == null) {
        item.episodeReviews = item.episodeReviews.filter((r) => r !== existing);
      } else {
        existing.isWatched = false;
      }
    } else if (existing) {
      existing.isWatched = true;
      existing.reviewedAt = new Date();
    } else {
      item.episodeReviews.push({ seasonNumber, episodeNumber, isWatched: true, reviewedAt: new Date() });
    }

    await item.save();
    triggerEpisodeMapPrewarmForShow(item);

    const myReview = item.episodeReviews.find(
      (r) => r.seasonNumber === seasonNumber && r.episodeNumber === episodeNumber
    );
    res.status(200).json({
      success: true,
      data: myReview
        ? {
            isWatched: myReview.isWatched,
            decimalRating: myReview.decimalRating ?? null,
            reviewText: myReview.reviewText ?? null,
            containsSpoilers: myReview.containsSpoilers ?? false,
          }
        : null,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

// POST /api/cinema/episode/rate (Protected)
// Sets (creates or edits) a rating/review for one specific episode - creates
// the show's CinemaItem if it isn't tracked yet (see findOrCreateShowItem).
exports.rateEpisode = async (req, res) => {
  try {
    const { tmdbId, title, cover, releaseDate, seasonNumber, episodeNumber, decimalRating, reviewText, containsSpoilers } = req.body;

    if (!tmdbId || !title || seasonNumber == null || episodeNumber == null) {
      return res.status(400).json({ success: false, message: "tmdbId, title, seasonNumber, and episodeNumber are required" });
    }
    if (typeof decimalRating !== "number" || decimalRating < 0 || decimalRating > 10) {
      return res.status(400).json({ success: false, message: "decimalRating must be a number between 0 and 10" });
    }

    const item = await findOrCreateShowItem(req.user._id, { tmdbId, title, cover, releaseDate });
    let entry = item.episodeReviews.find(
      (r) => r.seasonNumber === seasonNumber && r.episodeNumber === episodeNumber
    );

    if (!entry) {
      entry = { seasonNumber, episodeNumber };
      item.episodeReviews.push(entry);
      entry = item.episodeReviews[item.episodeReviews.length - 1];
    }

    entry.isWatched = true; // rating an episode implies you watched it
    entry.decimalRating = decimalRating;
    if (reviewText !== undefined) entry.reviewText = reviewText;
    if (containsSpoilers !== undefined) entry.containsSpoilers = containsSpoilers;
    entry.reviewedAt = new Date();

    await item.save();
    triggerEpisodeMapPrewarmForShow(item);

    res.status(200).json({
      success: true,
      data: {
        isWatched: entry.isWatched,
        decimalRating: entry.decimalRating,
        reviewText: entry.reviewText ?? null,
        containsSpoilers: entry.containsSpoilers ?? false,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

// POST /api/cinema/rate (Protected)
// Sets (creates or edits) a rating/review for a whole movie/show - creates
// the CinemaItem if it doesn't exist yet, same create-if-missing pattern as
// toggleWatchlist/markCinemaWatched. Rating always implies watched (mirrors
// editCinemaItem's refine behavior).
exports.rateCinema = async (req, res) => {
  try {
    const { tmdbId, mediaType, title, cover, releaseDate, decimalRating, reviewText, containsSpoilers } = req.body;

    if (!tmdbId || !mediaType || !title) {
      return res.status(400).json({ success: false, message: "tmdbId, mediaType, and title are required" });
    }
    if (typeof decimalRating !== "number" || decimalRating < 0 || decimalRating > 10) {
      return res.status(400).json({ success: false, message: "decimalRating must be a number between 0 and 10" });
    }

    let item = await CinemaItem.findOne({ user: req.user._id, tmdbId, mediaType });

    if (item) {
      const isRefinement = item.isUnrefinedImport;
      item.decimalRating = decimalRating;
      item.isUnrefinedImport = false;
      item.isWatchlist = false;
      item.isWatched = true;
      if (reviewText !== undefined) item.reviewText = reviewText;
      if (containsSpoilers !== undefined) item.containsSpoilers = containsSpoilers;
      if (!isRefinement) item.createdAt = new Date();
      if (!item.genres?.length) {
        Object.assign(item, await fetchCinemaMetadata(tmdbId, mediaType));
      }
      await item.save();
    } else {
      const metadata = await fetchCinemaMetadata(tmdbId, mediaType);
      item = await CinemaItem.create({
        user: req.user._id,
        tmdbId,
        mediaType,
        title,
        cover,
        decimalRating,
        reviewText: reviewText ?? "",
        containsSpoilers: containsSpoilers ?? false,
        isWatched: true,
        isWatchlist: false,
        ...metadata,
        ...(!metadata.releaseDate && releaseDate ? { releaseDate } : {}),
      });
    }

    triggerEpisodeMapPrewarmForShow(item);
    await invalidateCalendarCache(req.user._id);

    res.status(200).json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

// GET /api/cinema/person/:personId (Protected)
// Bio + filmography + social links for the cast list's tap-to-expand detail
// popup. Filmography is split into "acting" (combined_credits.cast) and
// "directed" (combined_credits.crew filtered to job === "Director") per
// user's choice - full lists, not capped, sorted newest-release-first.
exports.getCinemaPersonDetail = async (req, res) => {
  try {
    const { personId } = req.params;

    const details = await getTmdbPersonDetails(personId);
    if (!details) {
      return res.status(404).json({ success: false, message: "Person not found" });
    }

    const toCredit = (c) => ({
      tmdbId: String(c.id),
      mediaType: c.media_type,
      title: c.title || c.name,
      cover: c.poster_path ? `${TMDB_IMAGE_BASE}${c.poster_path}` : null,
      releaseDate: c.release_date || c.first_air_date || null,
      // TV combined_credits nests character under roles[] instead of a flat
      // field (mirrors trimCast in callTmdb.js) - only roles[0] is ever shown.
      character: c.character || c.roles?.[0]?.character || null,
    });

    // A person can appear more than once in combined_credits.cast for the
    // same title (e.g. multiple TV credit entries per season) - dedupe by
    // tmdbId+mediaType, keeping the first (TMDb's own array order).
    const dedupe = (credits) => {
      const seen = new Set();
      return credits.filter((c) => {
        const key = `${c.tmdbId}:${c.mediaType}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };

    const sortNewestFirst = (a, b) => (b.releaseDate || "").localeCompare(a.releaseDate || "");

    const acting = dedupe(
      (details.combined_credits?.cast || []).filter((c) => c.poster_path).map(toCredit)
    ).sort(sortNewestFirst);

    const directed = dedupe(
      (details.combined_credits?.crew || [])
        .filter((c) => c.job === "Director" && c.poster_path)
        .map(toCredit)
    ).sort(sortNewestFirst);

    res.status(200).json({
      success: true,
      data: {
        name: details.name,
        profilePath: details.profile_path ? `https://image.tmdb.org/t/p/w185${details.profile_path}` : null,
        biography: details.biography || null,
        instagramUrl: details.external_ids?.instagram_id
          ? `https://instagram.com/${details.external_ids.instagram_id}`
          : null,
        twitterUrl: details.external_ids?.twitter_id
          ? `https://x.com/${details.external_ids.twitter_id}`
          : null,
        imdbUrl: details.external_ids?.imdb_id
          ? `https://www.imdb.com/name/${details.external_ids.imdb_id}`
          : null,
        acting,
        directed,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

// GET /api/cinema/popular-actors (Protected)
// Real, TMDb-wide "Top 50 Actors" ranking (not scoped to any single title) -
// opened by tapping a cast member's popularity number. Directors are
// deliberately not included here yet - TMDb's /person/popular endpoint isn't
// filterable by department and skews heavily toward actors, so a reliable
// "Top 50 Directors" list isn't available from this endpoint alone.
//
// Ranked by real Wikipedia monthly pageviews (not TMDb's raw `popularity`),
// which is a far more reliable "real world fame" signal - TMDb's own score
// can be skewed by a minor credit on an otherwise high-traffic show. This
// only re-ranks the candidates TMDb's /person/popular already surfaced; it
// can't surface someone who never made that seed list at all.
exports.getPopularActors = async (req, res) => {
  try {
    const actors = await getTmdbPopularActors();
    const candidates = actors.slice(0, 50);

    const enriched = await Promise.all(
      candidates.map(async (p) => {
        const { views, isFallback } = await getPersonWikipediaPopularity(p.id, p.popularity);
        return {
          personId: p.id,
          name: p.name,
          profilePath: p.profile_path ? `https://image.tmdb.org/t/p/w185${p.profile_path}` : null,
          popularity: views,
          isEstimated: isFallback,
          knownForTitle: p.known_for?.[0]?.title || p.known_for?.[0]?.name || null,
        };
      })
    );

    enriched.sort((a, b) => b.popularity - a.popularity);

    res.status(200).json({ success: true, data: enriched });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

// POST /api/cinema/import-trakt (multipart/form-data, field name "file")
// Imports a Trakt data-export zip (ratings + watchlist only) as CinemaItems for the authenticated user.
exports.importTraktExport = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Trakt export zip file is required" });
    }

    const rows = parseTraktExport(req.file.buffer);

    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: "No importable rows found in export" });
    }

    let imported = 0;
    let skipped = 0;
    let duplicates = 0;
    const seenKeys = new Set();

    for (const row of rows) {
      const canonicalId = getMediaCanonicalId(row.title, row.year);

      if (!canonicalId && !row.imdbId) {
        console.log(`Trakt import: skipped "${row.title}" - no title/year and no imdbId to identify it.`);
        skipped++;
        continue;
      }

      const dedupeKey = row.imdbId || canonicalId;
      if (seenKeys.has(dedupeKey)) {
        // Same title appears more than once in this export (e.g. duplicate
        // watchlist entry) - the item itself was already imported via the
        // first occurrence, so this isn't a failure, just a duplicate.
        console.log(`Trakt import: "${row.title}" (${row.year ?? "?"}) is a duplicate row in this export (key: ${dedupeKey}) - already imported via an earlier row.`);
        duplicates++;
        continue;
      }
      seenKeys.add(dedupeKey);

      const matchQuery = {
        user: req.user._id,
        ...(row.imdbId ? { imdbId: row.imdbId } : { canonicalId }),
      };

      const update = {
        user: req.user._id,
        mediaType: row.mediaType,
        title: row.title,
        ...(canonicalId ? { canonicalId } : {}),
        ...(row.imdbId ? { imdbId: row.imdbId } : {}),
        ...(row.tmdbId ? { tmdbId: row.tmdbId } : {}),
        ...(row.year ? { releaseDate: new Date(`${row.year}-01-01`) } : {}),
        ...(row.dateAdded ? { createdAt: row.dateAdded } : {}),
        isUnrefinedImport: true,
      };

      if (Number.isFinite(row.rating)) {
        update.decimalRating = Math.trunc(row.rating);
      } else {
        update.isWatchlist = true;
      }

      await CinemaItem.findOneAndUpdate(
        matchQuery,
        { $set: update },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        }
      );

      imported++;
    }

    console.log(`Trakt import: ${imported} item(s) imported, ${skipped} skipped, ${duplicates} duplicate(s) removed. Fetching cover art from TMDb...`);

    const { updated: coversUpdated, failed: coversFailed } = await backfillCinemaCovers({
      user: req.user._id,
    });

    console.log(`Trakt import: successfully updated cover art for ${coversUpdated} record(s) (${coversFailed} failed).`);

    res.status(200).json({
      success: true,
      data: { imported, skipped, duplicates, total: rows.length, coversUpdated },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

// PATCH /api/cinema/:id/refine (Protected) - owner only
// Submits a precise decimal rating (and optionally review text) for an
// imported item, clearing isUnrefinedImport. Mirrors reviewController's
// editReview - the general "edit cinema item" endpoint.
exports.editCinemaItem = async (req, res) => {
  try {
    const { decimalRating, reviewText } = req.body;

    if (typeof decimalRating !== "number" || decimalRating < 0 || decimalRating > 10) {
      return res.status(400).json({ success: false, message: "decimalRating must be a number between 0 and 10" });
    }

    const item = await CinemaItem.findOne({ _id: req.params.id, user: req.user._id });

    if (!item) {
      return res.status(404).json({ success: false, message: "Item not found" });
    }

    // Refining an unrated/imported item (first rating) keeps its original
    // createdAt so import history stays intact; only a later, regular edit
    // of an already-refined item bumps createdAt (matches music's editReview()).
    const isRefinement = item.isUnrefinedImport;

    item.decimalRating = decimalRating;
    item.isUnrefinedImport = false;
    item.isWatchlist = false; // rating it means it's watched, not still "to watch"
    item.isWatched = true;
    if (reviewText !== undefined) item.reviewText = reviewText;
    if (!isRefinement) item.createdAt = new Date();
    await item.save();

    triggerEpisodeMapPrewarmForShow(item);
    await invalidateCalendarCache(req.user._id);

    res.status(200).json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

// POST /api/cinema/watchlist/toggle (Protected)
// Toggles watchlist status for a movie/show, creating the CinemaItem if it
// doesn't exist yet (e.g. adding straight from search, before any review).
// Removing from the watchlist deletes the item outright if it has never been
// rated - otherwise (already reviewed) it just clears the isWatchlist flag,
// since the user may still want the review tracked (e.g. planning a rewatch).

// Fetches genres/duration/streamingPlatforms/releaseDate/releaseYearRange/imdbId
// for a single tmdbId (one cached getTmdbDetails call) - mirrors
// backfillCinemaMetadata.js's logic so newly-added watchlist items aren't
// immediately stale while waiting on that script to run again. `forceRefresh`
// bypasses the TMDb cache (used by the daily cinema-metadata refresh cron).
const fetchCinemaMetadata = async (tmdbId, mediaType, { forceRefresh = false } = {}) => {
  const details = await getTmdbDetails(tmdbId, mediaType, { forceRefresh }).catch(() => null);
  if (!details) return {};

  const metadata = {};

  // Keeps the persisted poster in sync with TMDb's current default (it can
  // change after add-time, e.g. a placeholder/teaser poster swapped for the
  // final theatrical one) - otherwise search/detail (always live) drift out
  // of sync with the watchlist/calendar's one-time-captured cover.
  if (details.poster_path) {
    metadata.cover = `${TMDB_IMAGE_BASE}${details.poster_path}`;
  }

  if (details.genres?.length) {
    metadata.genres = details.genres.map((g) => g.name);
  }

  if (mediaType === "movie" && details.runtime) {
    metadata.duration = details.runtime * 60;
  } else if (mediaType === "tv" && details.episode_run_time?.[0]) {
    metadata.duration = details.episode_run_time[0] * 60;
  }

  // Canonical release date (not a later reissue) - see getUsOriginalTheatricalRelease.
  const releaseDate =
    mediaType === "movie" ? getUsOriginalTheatricalRelease(details) : details.first_air_date;
  if (releaseDate) {
    metadata.releaseDate = releaseDate;
  }

  if (details.status) {
    metadata.status = details.status;
  }

  if (mediaType === "movie") {
    metadata.hadTheatricalRelease = hasTheatricalRelease(details);
    metadata.digitalReleaseDate = getUsDigitalRelease(details);
    // Free too - same details call already fetched above. Drives the
    // "Back in Theaters"/"Returning to Theaters" badge client-side.
    metadata.rereleaseDate = getUsRerelease(details, releaseDate);
  }

  if (mediaType === "tv") {
    const startYear = releaseDate ? new Date(releaseDate).getFullYear() : null;
    const endYear = details.last_air_date ? new Date(details.last_air_date).getFullYear() : null;
    const hasEnded = details.status === "Ended" || details.status === "Canceled";

    if (startYear && hasEnded) {
      metadata.releaseYearRange = endYear && endYear !== startYear ? `${startYear}-${endYear}` : `${startYear}`;
    } else if (startYear) {
      metadata.releaseYearRange = endYear && endYear !== startYear ? `${startYear}-Present` : `${startYear}`;
    }

    if (details.number_of_seasons) {
      metadata.numberOfSeasons = details.number_of_seasons;
    }

    // Free too - same details call already fetched above. Drives the
    // "New Episode"/"Airing Soon"/"New Season Soon" badge client-side.
    metadata.lastEpisodeAirDate = details.last_episode_to_air?.air_date || null;
    metadata.nextEpisodeAirDate = details.next_episode_to_air?.air_date || null;
    metadata.nextEpisodeNumber = details.next_episode_to_air?.episode_number ?? null;
  }

  const providers = buildWatchProviders(details["watch/providers"]?.results?.US?.flatrate);
  if (providers.length) {
    metadata.streamingPlatforms = providers.map((p) => p.name);
  }

  if (details.imdb_id || details.external_ids?.imdb_id) {
    metadata.imdbId = details.imdb_id || details.external_ids.imdb_id;
  }

  return metadata;
};

// Local day-of-week in a fixed timezone (matches CALENDAR_CACHE_TIMEZONE/cron
// timezone) - used to decide "is today the weekly full-recheck day".
const getLocalDayOfWeek = (timeZone) =>
  new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(new Date());
exports.getLocalDayOfWeek = getLocalDayOfWeek;

// Distinct (tmdbId, mediaType) pairs across ALL users' tracked items (still
// on a watchlist OR already watched) - fetched/refreshed once per unique
// title, not once per user, since many users can track the same movie/show.
// `fullRecheck` false (the daily default) narrows to "unsettled" titles only:
// movies with no streaming platform yet (or an unconfirmed/future digital
// release date), and TV shows still ongoing (no releaseYearRange yet, or one
// ending in "-Present") - settled titles (already streaming, ended shows)
// are skipped since they're unlikely to have changed.
const getTitlesToRefresh = async (fullRecheck) => {
  const match = {
    tmdbId: { $exists: true, $ne: null },
    $or: [{ isWatchlist: true }, { isWatched: true }],
  };

  if (!fullRecheck) {
    const today = new Date();
    match.$and = [
      {
        $or: [
          { mediaType: "movie", streamingPlatforms: { $exists: false } },
          { mediaType: "movie", streamingPlatforms: { $size: 0 } },
          { mediaType: "movie", digitalReleaseDate: { $exists: false } },
          { mediaType: "movie", digitalReleaseDate: null },
          { mediaType: "movie", digitalReleaseDate: { $gt: today } },
          { mediaType: "tv", releaseYearRange: { $exists: false } },
          { mediaType: "tv", releaseYearRange: { $regex: "Present$" } },
        ],
      },
    ];
  }

  const groups = await CinemaItem.aggregate([
    { $match: match },
    { $group: { _id: { tmdbId: "$tmdbId", mediaType: "$mediaType" } } },
  ]);

  return groups.map((g) => g._id);
};

// Daily cron entry point (see server.js) - refreshes genres/duration/
// streamingPlatforms/releaseDate/hadTheatricalRelease/digitalReleaseDate/
// releaseYearRange/imdbId for every user's tracked CinemaItems, deduped by
// title so a blockbuster tracked by many users only costs one TMDb call.
// `fullRecheck` true (weekly, e.g. Sundays) re-checks every tracked title
// instead of just the "unsettled" subset - a safety net against rare TMDb
// data corrections that a settled/ended title might otherwise never pick up.
async function cronRefreshCinemaMetadata({ fullRecheck = false, batchSize = 10, delayMs = 1000 } = {}) {
  const titles = await getTitlesToRefresh(fullRecheck);
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < titles.length; i += batchSize) {
    const batch = titles.slice(i, i + batchSize);

    const results = await Promise.allSettled(
      batch.map(async ({ tmdbId, mediaType }) => {
        const metadata = await fetchCinemaMetadata(tmdbId, mediaType, { forceRefresh: true });
        if (!Object.keys(metadata).length) return { status: "skipped" };
        await CinemaItem.updateMany({ tmdbId, mediaType }, { $set: metadata });
        return { status: "updated" };
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value.status === "updated") {
        updated++;
      } else if (result.status === "rejected") {
        failed++;
        console.error("Cinema metadata refresh failed for a title:", result.reason);
      }
    }

    console.log(
      `Cinema metadata refresh: batch ${i / batchSize + 1} of ${Math.ceil(titles.length / batchSize)}`
    );
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  console.log(
    `Cinema metadata refresh complete (${fullRecheck ? "full" : "unsettled-only"}). Titles checked: ${titles.length}, updated: ${updated}, failed: ${failed}`
  );

  return { titlesChecked: titles.length, updated, failed };
}
exports.cronRefreshCinemaMetadata = cronRefreshCinemaMetadata;

exports.toggleWatchlist = async (req, res) => {
  try {
    const { tmdbId, mediaType, title, cover, releaseDate } = req.body;

    if (!tmdbId || !mediaType || !title) {
      return res.status(400).json({ success: false, message: "tmdbId, mediaType, and title are required" });
    }

    let item = await CinemaItem.findOne({ user: req.user._id, tmdbId, mediaType });

    if (item && item.isWatchlist) {
      if (item.decimalRating == null) {
        await item.deleteOne();
        await invalidateCalendarCache(req.user._id);
        return res.status(200).json({ success: true, data: { isWatchlist: false, item: null } });
      }
      item.isWatchlist = false;
      await item.save();
      await invalidateCalendarCache(req.user._id);
      return res.status(200).json({ success: true, data: { isWatchlist: false, item } });
    }

    if (item) {
      item.isWatchlist = true;
      item.watchlistAddedAt = new Date();
      // Backfill metadata on re-add too, in case it was created before this capture existed
      if (!item.genres?.length) {
        Object.assign(item, await fetchCinemaMetadata(tmdbId, mediaType));
      }
      await item.save();
    } else {
      const metadata = await fetchCinemaMetadata(tmdbId, mediaType);
      item = await CinemaItem.create({
        user: req.user._id,
        tmdbId,
        mediaType,
        title,
        cover,
        isWatchlist: true,
        watchlistAddedAt: new Date(),
        ...metadata,
        // Frontend-supplied releaseDate is a reasonable fallback if the TMDb
        // lookup above failed/returned nothing
        ...(!metadata.releaseDate && releaseDate ? { releaseDate } : {}),
      });
    }

    triggerEpisodeMapPrewarmForShow(item);
    await invalidateCalendarCache(req.user._id);

    res.status(200).json({ success: true, data: { isWatchlist: true, item } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

// POST /api/cinema/mark-watched (Protected)
// Toggles watched WITHOUT a rating (e.g. "I've seen this but don't want to
// rate it") - mirrors toggleWatchlist's create-if-missing/delete-if-nothing-
// left pattern. Unlike editCinemaItem (rating), this never touches decimalRating.
exports.markCinemaWatched = async (req, res) => {
  try {
    const { tmdbId, mediaType, title, cover, releaseDate } = req.body;

    if (!tmdbId || !mediaType || !title) {
      return res.status(400).json({ success: false, message: "tmdbId, mediaType, and title are required" });
    }

    let item = await CinemaItem.findOne({ user: req.user._id, tmdbId, mediaType });

    if (item && item.isWatched) {
      // Undo - nothing left tracking this item (no rating, not on
      // watchlist), so delete it entirely instead of leaving an empty record.
      if (item.decimalRating == null && !item.isWatchlist) {
        await item.deleteOne();
        await invalidateCalendarCache(req.user._id);
        return res.status(200).json({ success: true, data: null });
      }
      item.isWatched = false;
      await item.save();
      await invalidateCalendarCache(req.user._id);
      return res.status(200).json({ success: true, data: item });
    }

    if (item) {
      item.isWatched = true;
      item.isWatchlist = false;
      if (!item.genres?.length) {
        Object.assign(item, await fetchCinemaMetadata(tmdbId, mediaType));
      }
      await item.save();
    } else {
      const metadata = await fetchCinemaMetadata(tmdbId, mediaType);
      item = await CinemaItem.create({
        user: req.user._id,
        tmdbId,
        mediaType,
        title,
        cover,
        isWatched: true,
        isWatchlist: false,
        ...metadata,
        ...(!metadata.releaseDate && releaseDate ? { releaseDate } : {}),
      });
    }

    triggerEpisodeMapPrewarmForShow(item);
    await invalidateCalendarCache(req.user._id);

    res.status(200).json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

// GET /api/cinema/watchlist/:userId/filters (Protected)
// Distinct genres/providers actually present across everything this user is
// tracking (watchlist or watched) - powers the Genre/Availability dropdowns
// in the filter overlay so they only ever show options that could match something.
exports.getWatchlistFilterOptions = async (req, res) => {
  try {
    const { userId } = req.params;
    const isOwner = userId === req.user._id.toString();

    if (!isOwner) {
      const targetUser = await User.findById(userId).select("cinemaWatchlistIsPublic");
      if (!targetUser) {
        return res.status(404).json({ success: false, message: "User not found" });
      }
      if (!targetUser.cinemaWatchlistIsPublic) {
        return res.status(403).json({ success: false, message: "This watchlist is private" });
      }
    }

    const trackedFilter = { user: userId, $or: [{ isWatchlist: true }, { isWatched: true }] };
    const [genres, providers] = await Promise.all([
      CinemaItem.distinct("genres", trackedFilter),
      CinemaItem.distinct("streamingPlatforms", trackedFilter),
    ]);

    res.status(200).json({
      success: true,
      genres: genres.filter(Boolean).sort(),
      providers: providers.filter(Boolean).sort(),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

// GET /api/cinema/watchlist/:userId (Protected)
// Owners can always view their own watchlist; viewing someone else's requires
// that user to have set cinemaWatchlistIsPublic (private by default).
exports.getWatchlist = async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      cursorValue,
      cursorId,
      limit = 30,
      mediaType,
      search,
      status,
      releaseStatus,
      genre,
      provider,
      hasReleaseDate,
      hasRating,
      sortBy,
      sortOrder,
    } = req.query;
    const isOwner = userId === req.user._id.toString();

    if (!isOwner) {
      const targetUser = await User.findById(userId).select("cinemaWatchlistIsPublic");
      if (!targetUser) {
        return res.status(404).json({ success: false, message: "User not found" });
      }
      if (!targetUser.cinemaWatchlistIsPublic) {
        return res.status(403).json({ success: false, message: "This watchlist is private" });
      }
    }

    // Default (no status filter) shows everything actively tracked - still
    // on the watchlist OR already watched (rating something flips isWatchlist
    // off, so without the isWatched half here, watched items would never
    // show up at all). "unwatched"/"watched" narrow to just one side.
    // mediaType is deliberately NOT pushed into `conditions` here - it's
    // combined in separately below, so `conditions` alone (everything else)
    // can be reused to compute the All/Movies/TV Shows tab counts without
    // one tab's count being restricted by another tab's own filter.
    const conditions = [];
    if (status === "unwatched") {
      conditions.push({ isWatchlist: true, isWatched: { $ne: true } });
    } else if (status === "watched") {
      conditions.push({ isWatched: true });
    } else {
      conditions.push({ $or: [{ isWatchlist: true }, { isWatched: true }] });
    }
    if (search?.trim()) {
      // Escape regex special characters so a title like "Se7en" or a stray
      // "(" in a search term doesn't throw/behave unexpectedly
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      conditions.push({ title: { $regex: escaped, $options: "i" } });
    }
    if (genre?.trim()) {
      conditions.push({ genres: genre.trim() });
    }
    if (provider?.trim()) {
      conditions.push({ streamingPlatforms: provider.trim() });
    }
    if (hasReleaseDate === "true") {
      conditions.push({ releaseDate: { $ne: null } });
    }
    if (hasRating === "true") {
      conditions.push({ decimalRating: { $ne: null } });
    }
    // Release status: "coming_soon" is releaseDate in the future for either
    // media type. For movies specifically, we distinguish "in_theaters" from
    // "available" using each movie's own TMDb digital-release record instead
    // of a fixed day-count guess: once digitalReleaseDate exists and has
    // passed, it's left its exclusive theatrical window (even if our own
    // streamingPlatforms field hasn't caught up to reflect that yet). TV
    // shows have no theatrical stage, so they're just "available" once aired.
    // Caveat: streamingPlatforms/digitalReleaseDate aren't refreshed on a
    // recurring schedule yet (only at add-time/backfill), so a movie can
    // still lag briefly after actually becoming available.
    if (["available", "in_theaters", "coming_soon"].includes(releaseStatus)) {
      const todayBoundary = new Date(`${getLocalDateString(CALENDAR_CACHE_TIMEZONE)}T00:00:00`);
      const hasStreamingPlatform = { streamingPlatforms: { $exists: true, $ne: [] } };
      const noStreamingPlatform = { $or: [{ streamingPlatforms: { $exists: false } }, { streamingPlatforms: { $size: 0 } }] };
      const isReleased = { releaseDate: { $ne: null, $lte: todayBoundary } };
      const digitalReleaseArrived = { digitalReleaseDate: { $ne: null, $lte: todayBoundary } };
      const digitalReleaseNotArrived = {
        $or: [{ digitalReleaseDate: { $exists: false } }, { digitalReleaseDate: null }, { digitalReleaseDate: { $gt: todayBoundary } }],
      };
      // Exclusive theatrical windows don't last forever - without this bound,
      // an old catalog title that never got streamingPlatforms/digitalReleaseDate
      // backfilled (missing data, not actually still in theaters) would be
      // misclassified as "in theaters" indefinitely.
      const IN_THEATERS_WINDOW_DAYS = 90;
      const inTheatersWindowStart = new Date(todayBoundary.getTime() - IN_THEATERS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      const releasedWithinTheatersWindow = { releaseDate: { $ne: null, $lte: todayBoundary, $gte: inTheatersWindowStart } };
      const releasedBeforeTheatersWindow = { releaseDate: { $lt: inTheatersWindowStart } };

      if (releaseStatus === "coming_soon") {
        conditions.push({ releaseDate: { $gt: todayBoundary } });
      } else if (releaseStatus === "in_theaters") {
        // Only counts as "in theaters" if it actually had a US theatrical run
        // at all - otherwise a streaming-only/VOD-only movie that just hasn't
        // been picked up by a tracked platform yet would be misclassified.
        // noStreamingPlatform/digitalReleaseNotArrived both use "$or" - can't
        // spread both into one object (the second would silently clobber the
        // first's key), so combine them via an explicit "$and" instead.
        conditions.push({
          mediaType: "movie",
          hadTheatricalRelease: true,
          ...releasedWithinTheatersWindow,
          $and: [noStreamingPlatform, digitalReleaseNotArrived],
        });
      } else {
        conditions.push({
          $or: [
            { mediaType: "tv", ...isReleased },
            { mediaType: "movie", $or: [hasStreamingPlatform, digitalReleaseArrived] },
            // Fallback for the same aged-out-of-theaters gap above: past the
            // window with no streaming/digital data on record, assume it's
            // available by now rather than leaving it in neither bucket.
            { mediaType: "movie", hadTheatricalRelease: true, ...releasedBeforeTheatersWindow },
          ],
        });
      }
    }

    // TV only - mirrors the client's shared getTvEpisodeBadge windows: a
    // recently-aired episode (30 days), a soon-airing season premiere (45
    // days, episode 1), or a soon-airing regular next episode (7 days).
    if (releaseStatus === "new_episodes") {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const fortyFiveDaysFromNow = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);
      conditions.push({
        mediaType: "tv",
        $or: [
          { lastEpisodeAirDate: { $gte: thirtyDaysAgo, $lte: now } },
          { nextEpisodeAirDate: { $gte: now, $lte: sevenDaysFromNow }, nextEpisodeNumber: { $ne: 1 } },
          { nextEpisodeAirDate: { $gte: now, $lte: fortyFiveDaysFromNow }, nextEpisodeNumber: 1 },
        ],
      });
    }

    // Movie only - mirrors the client's shared getMovieRereleaseBadge windows:
    // a theatrical reissue that's either recently happened or coming soon
    // (both ±45 days), e.g. an anniversary re-release like Akira or Wet Hot
    // American Summer.
    if (releaseStatus === "back_in_theaters") {
      const now = new Date();
      const fortyFiveDaysAgo = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);
      const fortyFiveDaysFromNow = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);
      conditions.push({
        mediaType: "movie",
        rereleaseDate: { $gte: fortyFiveDaysAgo, $lte: fortyFiveDaysFromNow },
      });
    }

    const mediaTypeCondition = mediaType === "movie" || mediaType === "tv" ? [{ mediaType }] : [];
    const baseQuery = { user: userId, $and: [...conditions, ...mediaTypeCondition] };
    const query = { ...baseQuery };

    // Sort field is selectable now (previously always createdAt) - cursor
    // pagination generalizes to whichever field is active. Known limitation:
    // items with no releaseDate (sorting by releaseDate) can make the cursor
    // comparison at that exact page boundary imprecise - acceptable given
    // how few items that affects in practice.
    const SORT_FIELDS = { dateAdded: "createdAt", releaseDate: "releaseDate", title: "title" };
    const sortField = SORT_FIELDS[sortBy] || "createdAt";
    const sortDirection = sortOrder === "asc" ? 1 : -1;

    if (cursorValue && cursorId) {
      const parsedCursorValue = sortField === "title" ? cursorValue : new Date(cursorValue);
      const cmpOp = sortDirection === 1 ? "$gt" : "$lt";
      query.$or = [
        { [sortField]: { [cmpOp]: parsedCursorValue } },
        { [sortField]: parsedCursorValue, _id: { [cmpOp]: cursorId } },
      ];
    }

    // totalCount reflects the current filters (ignores the cursor) - what the
    // panel header shows. watchlistCount is ALWAYS the true "still on my
    // watchlist" count regardless of any filter - what the outer profile stat
    // badge shows, kept separate so broadening the default above doesn't
    // change what that stat means. movieCount/tvCount/allCount power the
    // All/Movies/TV Shows tabs - each computed against every OTHER active
    // filter but ignoring the mediaType filter itself, so switching tabs
    // shows what each tab WOULD contain, not a count already narrowed by
    // whichever tab happens to be selected right now.
    const [items, totalCount, watchlistCount, allCount, movieCount, tvCount] = await Promise.all([
      CinemaItem.find(query).sort({ [sortField]: sortDirection, _id: sortDirection }).limit(Number(limit)),
      CinemaItem.countDocuments(baseQuery),
      CinemaItem.countDocuments({ user: userId, isWatchlist: true }),
      CinemaItem.countDocuments({ user: userId, $and: conditions }),
      CinemaItem.countDocuments({ user: userId, $and: [...conditions, { mediaType: "movie" }] }),
      CinemaItem.countDocuments({ user: userId, $and: [...conditions, { mediaType: "tv" }] }),
    ]);

    const last = items[items.length - 1];
    const nextCursor = last
      ? {
          cursorValue:
            sortField === "title" ? last.title : last[sortField] ? last[sortField].toISOString() : "",
          cursorId: last._id,
        }
      : null;

    res.status(200).json({
      success: true,
      data: items,
      nextCursor,
      totalCount,
      watchlistCount,
      mediaTypeCounts: { all: allCount, movie: movieCount, tv: tvCount },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

// GET /api/cinema/reviews (Protected)
// Everyone's rated CinemaItems for the same movie/show (mirrors music's
// getReviewsWithUserReview) - identifies "the same title" by imdbId first
// (most reliable), then tmdbId, then canonicalId (title+year, scoped to
// mediaType since canonicalId alone can't distinguish a movie from a show
// sharing the same title/year).
const REVIEW_SORT_OPTIONS = {
  recent: { createdAt: -1 },
  highest: { decimalRating: -1, createdAt: -1 },
  liked: { likes: -1, createdAt: -1 },
};

exports.getCinemaReviews = async (req, res) => {
  try {
    const { imdbId, tmdbId, canonicalId, mediaType, sort } = req.query;
    const userId = req.user._id;

    let identityQuery;
    if (imdbId) {
      identityQuery = { imdbId };
    } else if (tmdbId) {
      identityQuery = { tmdbId, ...(mediaType ? { mediaType } : {}) };
    } else if (canonicalId) {
      identityQuery = { canonicalId, ...(mediaType ? { mediaType } : {}) };
    } else {
      return res.status(400).json({ success: false, message: "imdbId, tmdbId, or canonicalId is required." });
    }

    const sortOrder = REVIEW_SORT_OPTIONS[sort] || REVIEW_SORT_OPTIONS.recent;

    const reviews = await CinemaItem.find({
      ...identityQuery,
      decimalRating: { $ne: null },
    })
      .populate("user", "username profilePicture")
      .sort(sortOrder)
      .lean();

    const userReview =
      reviews.find((item) => item.user?._id?.toString() === userId.toString()) || null;
    res.status(200).json({ success: true, data: { reviews, userReview } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

// GET /api/cinema/tv/:tmdbId/episode/:seasonNumber/:episodeNumber/reviews (Protected)
// Everyone's rated episodeReviews entries for this exact episode, across ALL
// users tracking the show - mirrors getCinemaReviews above but unwinds the
// nested episodeReviews array instead of matching whole CinemaItem documents.
const EPISODE_REVIEW_SORT_OPTIONS = {
  recent: { reviewedAt: -1 },
  highest: { decimalRating: -1, reviewedAt: -1 },
};

exports.getEpisodeReviews = async (req, res) => {
  try {
    const { tmdbId, seasonNumber, episodeNumber } = req.params;
    const sort = req.query.sort;
    const seasonNum = Number(seasonNumber);
    const episodeNum = Number(episodeNumber);
    const userId = req.user._id;

    const sortOrder = EPISODE_REVIEW_SORT_OPTIONS[sort] || EPISODE_REVIEW_SORT_OPTIONS.recent;

    const reviews = await CinemaItem.aggregate([
      { $match: { tmdbId, mediaType: "tv" } },
      { $unwind: "$episodeReviews" },
      {
        $match: {
          "episodeReviews.seasonNumber": seasonNum,
          "episodeReviews.episodeNumber": episodeNum,
          "episodeReviews.decimalRating": { $ne: null },
        },
      },
      { $lookup: { from: "users", localField: "user", foreignField: "_id", as: "user" } },
      { $unwind: "$user" },
      {
        $project: {
          _id: 0,
          user: { _id: "$user._id", username: "$user.username", profilePicture: "$user.profilePicture" },
          decimalRating: "$episodeReviews.decimalRating",
          reviewText: "$episodeReviews.reviewText",
          containsSpoilers: "$episodeReviews.containsSpoilers",
          reviewedAt: "$episodeReviews.reviewedAt",
        },
      },
      { $sort: sortOrder },
    ]);

    const userReview = reviews.find((r) => r.user?._id?.toString() === userId.toString()) || null;
    res.status(200).json({ success: true, data: { reviews, userReview } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

