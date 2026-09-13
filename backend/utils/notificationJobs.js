const User = require("../models/User");
const Release = require("../models/Release");
const CinemaItem = require("../models/CinemaItem");
const { getLocalDateString } = require("./calendarHelpers");
const { createAndSendNotification, notifyUsersForNewMusicRelease } = require("./pushNotifications");

const TIMEZONE = "America/Chicago";

function getLocalParts(timezone, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

function localDateString(timezone, date = new Date()) {
  const parts = getLocalParts(timezone, date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function dateOnly(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : null;
}

function dayBounds(dateString) {
  return {
    start: new Date(`${dateString}T00:00:00.000Z`),
    end: new Date(`${dateString}T23:59:59.999Z`),
  };
}

async function scanCinemaReleaseNotifications() {
  const today = getLocalDateString(TIMEZONE);
  const { start, end } = dayBounds(today);
  const items = await CinemaItem.find({
    $or: [
      { mediaType: "movie", releaseDate: { $gte: start, $lte: end }, isWatchlist: true },
      { mediaType: "tv", lastEpisodeAirDate: { $gte: start, $lte: end }, isWatchlist: true },
      { mediaType: "tv", nextEpisodeAirDate: { $gte: start, $lte: end }, nextEpisodeNumber: 1, isWatchlist: true },
    ],
  }).lean();

  await Promise.allSettled(items.map(async (item) => {
    if (item.mediaType === "movie") {
      if (!item.user) return;
      const enabled = await User.exists({ _id: item.user, "notificationPreferences.immediateMovies": { $ne: false } });
      if (!enabled) return;
      return createAndSendNotification({
        user: item.user,
        type: "movie-release",
        dedupeKey: `movie-release:${item.tmdbId || item._id}:${today}`,
        title: "Movie released",
        message: item.title,
        targetUrl: "/calendar?range=past",
      });
    }

    const episodeDate = dateOnly(item.lastEpisodeAirDate);
    if (episodeDate === today && item.user) {
      const enabled = await User.exists({ _id: item.user, "notificationPreferences.immediateTvEpisodes": { $ne: false } });
      if (enabled) {
        await createAndSendNotification({
          user: item.user,
          type: "tv-episode",
          dedupeKey: `tv-episode:${item.tmdbId || item._id}:${today}`,
          title: "New episode aired",
          message: item.title,
          targetUrl: "/calendar?range=past",
        });
      }
    }

    if (dateOnly(item.nextEpisodeAirDate) === today && item.nextEpisodeNumber === 1 && item.user) {
      const enabled = await User.exists({ _id: item.user, "notificationPreferences.immediateTvSeasons": { $ne: false } });
      if (enabled) {
        await createAndSendNotification({
          user: item.user,
          type: "tv-season",
          dedupeKey: `tv-season:${item.tmdbId || item._id}:${today}`,
          title: "New season started",
          message: item.title,
          targetUrl: "/calendar?range=past",
        });
      }
    }
  }));
}

async function scanMusicReleaseNotifications() {
  const today = getLocalDateString(TIMEZONE);
  const { start, end } = dayBounds(today);
  const releases = await Release.find({ releaseDate: { $gte: start, $lte: end } }).lean();

  await Promise.allSettled(releases.map((release) =>
    notifyUsersForNewMusicRelease(release)
  ));
}

async function sendWeeklySummaries() {
  const users = await User.find({ "notificationPreferences.weeklySummary": true }).lean();

  await Promise.allSettled(users.map(async (user) => {
    const timezone = user.notificationPreferences?.timezone || TIMEZONE;
    const local = getLocalParts(timezone);
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(local.weekday);
    const configuredDay = user.notificationPreferences?.weeklySummaryDay ?? 1;
    const configuredHour = user.notificationPreferences?.weeklySummaryHour ?? 9;
    if (day !== configuredDay || Number(local.hour) !== configuredHour) return;

    const currentDate = localDateString(timezone);
    const current = new Date(`${currentDate}T00:00:00.000Z`);
    const weekStart = new Date(current);
    weekStart.setUTCDate(current.getUTCDate() - 7);
    const artistIds = (user.artistList || []).map((artist) => artist.id);
    const [musicReleases, cinemaItems] = await Promise.all([
      Release.find({ artistId: { $in: artistIds }, releaseDate: { $gte: weekStart, $lt: current } })
        .select("title artistName recordType releaseDate")
        .lean(),
      CinemaItem.find({
        user: user._id,
        isWatchlist: true,
        $or: [
          { releaseDate: { $gte: weekStart, $lt: current } },
          { lastEpisodeAirDate: { $gte: weekStart, $lt: current } },
        ],
      }).select("mediaType").lean(),
    ]);

    const movies = cinemaItems.filter((item) => item.mediaType === "movie");
    const tv = cinemaItems.filter((item) => item.mediaType === "tv");
    if (!musicReleases.length && !movies.length && !tv.length) return;

    return createAndSendNotification({
      user: user._id,
      type: "weekly-summary",
      dedupeKey: `weekly-summary:${currentDate}`,
      title: "Your weekly release summary",
      message: `${movies.length} movie${movies.length === 1 ? "" : "s"}, ${tv.length} TV release${tv.length === 1 ? "" : "s"}, ${musicReleases.length} music release${musicReleases.length === 1 ? "" : "s"}`,
      targetUrl: "/calendar",
      details: {
        movies: movies.map((item) => item.title),
        tv: tv.map((item) => item.title),
        music: musicReleases.map((release) => `${release.artistName} - ${release.title}`),
      },
    });
  }));
}

module.exports = { scanCinemaReleaseNotifications, scanMusicReleaseNotifications, sendWeeklySummaries };
