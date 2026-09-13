const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: ["music-release", "movie-release", "tv-episode", "tv-season", "weekly-summary"],
      required: true,
    },
    dedupeKey: { type: String, required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    targetUrl: { type: String, required: true },
    details: { type: mongoose.Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

NotificationSchemaIndex();

function NotificationSchemaIndex() {
  notificationSchema.index({ user: 1, dedupeKey: 1 }, { unique: true });
  notificationSchema.index({ user: 1, createdAt: -1 });
}

module.exports = mongoose.model("Notification", notificationSchema);
