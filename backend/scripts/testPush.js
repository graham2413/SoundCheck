// One-off test: node backend/scripts/testPush.js <email> [count]
// Sends `count` (default 1) real push notifications to the given user's
// saved PushSubscription via the same createAndSendNotification() path
// production notification code uses (music/movie releases, etc).
if (require.main === module) {
  const dotenv = require("dotenv");
  const path = require("path");
  dotenv.config({ path: path.resolve(__dirname, "../.env.development") });
}
const mongoose = require("mongoose");
const User = require("../models/User");
const { createAndSendNotification } = require("../utils/pushNotifications");

(async () => {
  const email = process.argv[2];
  const count = parseInt(process.argv[3], 10) || 1;
  if (!email) {
    console.error("Usage: node backend/scripts/testPush.js <email> [count]");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const user = await User.findOne({ email }).select("_id").lean();
  if (!user) {
    console.error(`No user found with email ${email}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  for (let i = 1; i <= count; i++) {
    const result = await createAndSendNotification({
      user: user._id,
      type: "music-release",
      dedupeKey: `test-push:${Date.now()}:${i}`,
      title: `Test Notification #${i}`,
      message: "This is a test push from SoundCheck - if you see this, it works!",
      targetUrl: "/",
    });
    console.log(`Sent #${i}:`, result ? "ok" : "skipped (dedupe collision)");
  }

  await mongoose.disconnect();
})();
