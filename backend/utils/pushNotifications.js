const webpush = require("web-push");
const User = require("../models/User");
const PushSubscription = require("../models/PushSubscription");
const Notification = require("../models/Notification");

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
  if (!configureWebPush()) return;

  const subscription = await PushSubscription.findOne({ user: userId }).lean();
  if (!subscription) return;

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      },
      JSON.stringify({
        notification: {
          title: notification.title,
          body: notification.message,
          // Every push opens the Notifications Center list first (never a
          // direct deep link) - {url} bare wasn't the actual shape ngsw-worker
          // expects (it reads onActionClick.default.{operation,url}), so this
          // silently did nothing on click before.
          data: { onActionClick: { default: { operation: "navigateLastFocusedOrOpen", url: "/notifications" } } },
        },
      })
    );
  } catch (error) {
    if (error.statusCode === 404 || error.statusCode === 410) {
      await PushSubscription.deleteOne({ user: userId });
      return;
    }
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

async function notifyUsersForNewMusicRelease(release) {
  if (new Date(release.releaseDate) > new Date()) return;

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
