const Notification = require("../models/Notification");
const PushSubscription = require("../models/PushSubscription");
const User = require("../models/User");

const NOTIFICATION_TYPES = new Set([
  "music-release",
  "movie-release",
  "tv-episode",
  "tv-season",
  "weekly-summary",
]);

function getUserId(req) {
  return req.user?._id;
}

exports.getNotifications = async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100);
    const notifications = await Notification.find({ user: getUserId(req) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json({ notifications });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

exports.deleteNotification = async (req, res) => {
  try {
    const result = await Notification.deleteOne({ _id: req.params.id, user: getUserId(req) });
    if (!result.deletedCount) return res.status(404).json({ message: "Notification not found" });
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting notification:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

exports.deleteAllNotifications = async (req, res) => {
  try {
    const result = await Notification.deleteMany({ user: getUserId(req) });
    res.json({ deletedCount: result.deletedCount });
  } catch (error) {
    console.error("Error deleting notifications:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

exports.savePushSubscription = async (req, res) => {
  try {
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ message: "A valid push subscription is required" });
    }

    const subscription = await PushSubscription.findOneAndUpdate(
      { user: getUserId(req) },
      { endpoint, keys, updatedAt: new Date() },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    res.json({ subscription: { endpoint: subscription.endpoint, updatedAt: subscription.updatedAt } });
  } catch (error) {
    console.error("Error saving push subscription:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

exports.deletePushSubscription = async (req, res) => {
  try {
    await PushSubscription.deleteOne({ user: getUserId(req) });
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting push subscription:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

exports.getNotificationPreferences = async (req, res) => {
  try {
    const user = await User.findById(getUserId(req)).select("notificationPreferences").lean();
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ preferences: user.notificationPreferences });
  } catch (error) {
    console.error("Error fetching notification preferences:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

exports.updateNotificationPreferences = async (req, res) => {
  try {
    const allowedFields = [
      "immediateMusic",
      "immediateMovies",
      "immediateTvEpisodes",
      "immediateTvSeasons",
      "weeklySummary",
      "weeklySummaryDay",
      "weeklySummaryHour",
      "timezone",
    ];
    const updates = {};
    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) updates[`notificationPreferences.${field}`] = req.body[field];
    }
    if (!Object.keys(updates).length) return res.status(400).json({ message: "No notification preferences supplied" });

    const user = await User.findByIdAndUpdate(getUserId(req), { $set: updates }, { new: true })
      .select("notificationPreferences")
      .lean();
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ preferences: user.notificationPreferences });
  } catch (error) {
    console.error("Error updating notification preferences:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

exports.createNotification = async ({ user, type, dedupeKey, title, message, targetUrl }) => {
  if (!NOTIFICATION_TYPES.has(type)) throw new Error(`Unsupported notification type: ${type}`);
  return Notification.create({ user, type, dedupeKey, title, message, targetUrl });
};
