// utils/calendarHelpers.js
//
// Shared date/grouping logic for both the cinema calendar (cinemaController.js)
// and the music calendar (mainSearchController.js) - extracted so the two
// calendars behave identically (same subtitle cascade, same month-group
// shape) instead of maintaining two copies of the same math.
const CALENDAR_CACHE_TIMEZONE = "America/Chicago"; // matches server.js cron timezone

// Today's date (YYYY-MM-DD) in a fixed local timezone, so "a new day" lines up
// with the user's expected midnight instead of the server's UTC midnight
const getLocalDateString = (timeZone = CALENDAR_CACHE_TIMEZONE) =>
  new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());

// Seconds remaining until the next local midnight in `timeZone` - used to
// size a cache TTL so something warmed once (e.g. the calendar-details
// prewarm cron, see server.js) actually lasts the rest of the calendar day
// instead of expiring on a fixed duration that can fall hours before
// midnight depending on what time the warm happened to run. Not DST-transition
// aware (can be off by ~1h on the two days/year the clock shifts) - fine for
// a cache TTL, not worth the added complexity for that edge case.
const secondsUntilNextLocalMidnight = (timeZone = CALENDAR_CACHE_TIMEZONE) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date());
  const get = (type) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  // hour12:false can format midnight as "24" in some environments - normalize.
  const elapsedSeconds = (get("hour") % 24) * 3600 + get("minute") * 60 + get("second");
  return Math.max(60, 86400 - elapsedSeconds);
};

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

// Builds the calendar page's dynamic subtitle ("N upcoming releases this
// week" etc, cascading through progressively wider windows) - computed over
// the full (already date-filtered/sorted) entry list, NOT just whichever page
// is being returned, so it stays accurate even before every item in a given
// window/month has actually been paged in.
// Cascade: this week -> last/next week -> this month -> this year -> total.
// Direction flips for 'past' (last week/this month-so-far/this year-so-far
// instead of next week/rest-of-month/rest-of-year). Every entry must expose
// a date-only "airDate" string field (YYYY-MM-DD).
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

// Per-month release counts the UI's month-group headers need, computed over
// the full entry list for the same "true total, not just what's paged in"
// reason as the subtitle above.
// Cross-source dedupe key component for upcoming music releases (see
// mainSearchController.js's syncUpcomingReleasesForArtist) - Spotify and
// MusicBrainz have no shared exact release id, so the same real release
// found via both must normalize to the same string here to collapse into
// one UpcomingRelease row instead of showing twice on the calendar.
const normalizeReleaseTitle = (title) =>
  title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ");

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

module.exports = {
  CALENDAR_CACHE_TIMEZONE,
  getLocalDateString,
  secondsUntilNextLocalMidnight,
  MONTH_NAMES,
  parseYmd,
  toYmdStr,
  addDaysStr,
  endOfMonthStr,
  endOfYearStr,
  buildCalendarSubtitle,
  buildCalendarMonthGroups,
  normalizeReleaseTitle,
};
