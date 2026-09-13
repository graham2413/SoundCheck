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
          data: { onActionClick: { default: notification.targetUrl } },
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
        title: `New release from ${release.artistName}`,
        message: release.title,
        targetUrl: "/calendar?kind=music&range=past",
      })
    )
  );
}

module.exports = {
  createAndSendNotification,
  notifyUsersForNewMusicRelease,
};
