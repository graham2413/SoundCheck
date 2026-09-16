const webpush = require("web-push");
const User = require("../models/User");
const PushSubscription = require("../models/PushSubscription");
const Notification = require("../models/Notification");
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

// Only a release dated TODAY (America/Chicago, matching notificationJobs.js's
// scanMusicReleaseNotifications - the cron job that also calls this function)
// triggers a push. syncArtistAlbums() inserts a Release doc the first time
// OUR db sees it, which for a newly-followed (or re-synced) artist can
// include albums that actually came out long ago - without this exact-day
// check, that first sync reads as "new" and notifies everyone for the
// artist's entire back catalog. Matching scanMusicReleaseNotifications's own
// gate exactly (rather than a looser multi-day window) means the two call
// sites can never disagree on what counts as "new today".
function isReleasedToday(releaseDate) {
  const todayStr = getLocalDateString();
  const start = new Date(`${todayStr}T00:00:00.000Z`);
  const end = new Date(`${todayStr}T23:59:59.999Z`);
  const releaseTime = new Date(releaseDate).getTime();
  return releaseTime >= start.getTime() && releaseTime <= end.getTime();
}

async function notifyUsersForNewMusicRelease(release) {
  if (!isReleasedToday(release.releaseDate)) return;

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
}

module.exports = {
  createAndSendNotification,
  notifyUsersForNewMusicRelease,
};
