const mongoose = require("mongoose");

const pushSubscriptionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    endpoint: { type: String, required: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    updatedAt: { type: Date, default: Date.now },
    // Records the outcome of the most recent send attempt (see
    // sendPushForNotification in utils/pushNotifications.js) - previously a
    // failed send only went to a server console.error, with nothing
    // persisted, so there was no way to look back and confirm whether a
    // push was even attempted for a given user.
    lastPushStatus: { type: String, enum: ["sent", "failed"], default: null },
    lastPushError: { type: String, default: null },
    lastPushAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PushSubscription", pushSubscriptionSchema);
