// One-time setup helper (specs/022-web-push-reminders/quickstart.md) — prints a fresh VAPID
// keypair to paste into `wrangler secret put VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`. Never run this
// against an environment that already has a keypair in use: every subscribed device would need to
// resubscribe, since a push subscription is tied to the public key it was created with.
import { generateVapidKeys, serializeVapidKeys } from "web-push-browser";

const keys = await generateVapidKeys();
const serialized = await serializeVapidKeys(keys);

console.log("VAPID_PUBLIC_KEY:");
console.log(serialized.publicKey);
console.log();
console.log("VAPID_PRIVATE_KEY:");
console.log(serialized.privateKey);
