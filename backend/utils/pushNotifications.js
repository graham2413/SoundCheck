const webpush = require("web-push");
const User = require("../models/User");
const PushSubscription = require("../models/PushSubscription");
const Notification = require("../models/Notification");
const Release = require("../models/Release");
const { getLocalDateString } = require("./calendarHelpers");

let vapidConfigured = false;

function configureWebPush() {
  if (vapidConfigured) return true;
  const { VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  if (!VAPID_SUBJECT || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidConfigured = true;
  return true;
}

async function sendPushForNotification(userId, notification) {
  const subscription = await PushSubscription.findOne({ user: userId }).lean();
  if (!subscription) return;

  try {
    // Inside the try (not a standalone early-return before it) because
    // setVapidDetails() throws synchronously on a malformed VAPID_SUBJECT
    // (must start with "mailto:" or "https:") - previously that throw
    // happened before this try block even started, so it went uncaught,
    // silently rejecting the promise and leaving PushSubscription's
    // lastPushStatus stuck at null forever with nothing logged anywhere,
    // for every single send, indistinguishable from "never attempted".
    if (!configureWebPush()) return;

    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      },
      JSON.stringify({
        notification: {
          // iOS/WebKit web push unconditionally appends its own app-name
          // attribution below the body regardless of what's sent here
          // (sourced from manifest.webmanifest's name, not overridable or
          // removable - confirmed against WebKit's web push docs and
          // third-party PWA push write-ups, Sept 2026). Putting the app name
          // in `title` too (tried previously) just duplicated it ("Cinewave"
          // / "from Cinewave") - title stays the notification's own headline
          // so the app name appears exactly once, where iOS puts it anyway.
          title: notification.title,
          body: notification.message,
          // Large image shown in the expanded notification (Android Chrome
          // only - iOS's web push ignores this entirely and always shows the
          // static manifest icon regardless of what's sent here, confirmed
          // against WebKit's docs, Sept 2026).
          ...(notification.details?.cover ? { image: notification.details.cover } : {}),
          // Every push opens the Notifications Center list first (never a
          // direct deep link) - {url} bare wasn't the actual shape ngsw-worker
          // expects (it reads onActionClick.default.{operation,url}), so this
          // silently did nothing on click before.
          data: { onActionClick: { default: { operation: "navigateLastFocusedOrOpen", url: "/notifications" } } },
        },
      })
    );
    await PushSubscription.updateOne(
      { user: userId },
      { $set: { lastPushStatus: "sent", lastPushError: null, lastPushAt: new Date() } }
    );
  } catch (error) {
    if (error.statusCode === 404 || error.statusCode === 410) {
      await PushSubscription.deleteOne({ user: userId });
      return;
    }
    await PushSubscription.updateOne(
      { user: userId },
      { $set: { lastPushStatus: "failed", lastPushError: error.message || String(error), lastPushAt: new Date() } }
    ).catch(() => {});
    console.error("Push notification delivery failed:", error.message || error);
  }
}

async function createAndSendNotification({ user, type, dedupeKey, title, message, targetUrl, details = null }) {
  let notification;
  try {
    notification = await Notification.create({ user, type, dedupeKey, title, message, targetUrl, details });
  } catch (error) {
    if (error.code === 11000) return null;
    throw error;
  }

  await sendPushForNotification(user, notification);
  return notification;
}

// Deezer's recordType ("album" | "single" | "ep" | "compile") -> the word
// used in the notification title so it reads "New song/album/EP from X"
// instead of the generic "release" whenever we actually know which it is.
function recordTypeLabel(recordType) {
  switch (recordType) {
    case "single":
      return "song";
    case "album":
      return "album";
    case "ep":
      return "EP";
    case "compile":
      return "compilation";
    default:
      return "release";
  }
}

// A release only qualifies for a push within a few days of its release date
// (America/Chicago, matching notificationJobs.js's scanMusicReleaseNotifications
// - the cron job that also calls this function). syncArtistAlbums() inserts a
// Release doc the first time OUR db sees it, which for a newly-followed (or
// re-synced) artist can include albums that actually came out long ago -
// without this window, that first sync would read as "new" and notify
// everyone for the artist's entire back catalog. The window is a few days
// wide (not same-day-only) so a release Deezer itself was slow to list still
// gets caught by the next day's sweep instead of being silently skipped
// forever once its releaseDate is no longer "today". `notifiedAt` (set below
// once a push actually goes out) is what actually prevents duplicates across
// repeated sweeps of the same still-recent release - the window just bounds
// how far back a sweep bothers looking at all.
const NOTIFY_WINDOW_DAYS = 3;

function isWithinNotifyWindow(releaseDate) {
  const todayStr = getLocalDateString();
  const end = new Date(`${todayStr}T23:59:59.999Z`);
  const start = new Date(end.getTime() - NOTIFY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const releaseTime = new Date(releaseDate).getTime();
  return releaseTime >= start.getTime() && releaseTime <= end.getTime();
}

async function notifyUsersForNewMusicRelease(release) {
  if (release.notifiedAt) return;
  if (!isWithinNotifyWindow(release.releaseDate)) return;

  const users = await User.find({
    "artistList.id": release.artistId,
    "notificationPreferences.immediateMusic": { $ne: false },
  })
    .select("_id")
    .lean();

  await Promise.allSettled(
    users.map((user) =>
      createAndSendNotification({
        user: user._id,
        type: "music-release",
        dedupeKey: `music-release:${release.albumId}`,
        title: `New ${recordTypeLabel(release.recordType)} from ${release.artistName}`,
        message: release.title,
        targetUrl: "/calendar?kind=music&range=past",
        details: {
          albumId: release.albumId,
          artistName: release.artistName,
          title: release.title,
          cover: release.cover,
          isExplicit: release.isExplicit,
          releaseDate: release.releaseDate,
          recordType: release.recordType,
        },
      })
    )
  );

  // Marks this release as handled regardless of _id shape (release can be a
  // plain object from syncArtistAlbums's docsToInsert, which has no _id, or a
  // lean Mongo doc from the sweep, which does) - matching on albumId instead
  // works for both and is unique per Release anyway.
  await Release.updateOne({ albumId: release.albumId }, { $set: { notifiedAt: new Date() } });
}

module.exports = {
  createAndSendNotification,
  notifyUsersForNewMusicRelease,
};
