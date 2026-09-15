// One-off diagnostic: node backend/scripts/checkPushSetup.js <email>
// Checks whether VAPID env vars are configured and whether the given user
// has a saved PushSubscription, without sending anything.
if (require.main === module) {
  const dotenv = require("dotenv");
  const path = require("path");
  dotenv.config({ path: path.resolve(__dirname, "../.env.development") });
}
const mongoose = require("mongoose");
const User = require("../models/User");
const PushSubscription = require("../models/PushSubscription");

(async () => {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: node backend/scripts/checkPushSetup.js <email>");
    process.exit(1);
  }

  const { VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, MONGO_URI } = process.env;
  console.log("VAPID_SUBJECT set:", !!VAPID_SUBJECT);
  console.log("VAPID_PUBLIC_KEY set:", !!VAPID_PUBLIC_KEY);
  console.log("VAPID_PRIVATE_KEY set:", !!VAPID_PRIVATE_KEY);
  console.log("MONGO_URI set:", !!MONGO_URI);

  await mongoose.connect(MONGO_URI);

  const user = await User.findOne({ email }).select("_id email username").lean();
  if (!user) {
    console.log(`No user found with email ${email}`);
    await mongoose.disconnect();
    return;
  }
  console.log("Found user:", user.username, user._id.toString());

  const sub = await PushSubscription.findOne({ user: user._id }).lean();
  console.log("Has push subscription:", !!sub);
  if (sub) {
    console.log("Endpoint host:", new URL(sub.endpoint).host);
    console.log("Subscription updatedAt:", sub.updatedAt);
    console.log("Last push status:", sub.lastPushStatus || "(never sent)");
    console.log("Last push at:", sub.lastPushAt || "(never sent)");
    if (sub.lastPushError) console.log("Last push error:", sub.lastPushError);
  }

  await mongoose.disconnect();
})();
