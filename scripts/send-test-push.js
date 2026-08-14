#!/usr/bin/env node
/**
 * scripts/send-test-push.js
 *
 * Send a test push notification to a device via the Expo Push API.
 * Useful for verifying the full FCM → device path (app closed, backgrounded,
 * or foregrounded) without needing the backend to be running.
 *
 * Usage:
 *   node scripts/send-test-push.js "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
 *
 *   # custom title / body
 *   node scripts/send-test-push.js "ExponentPushToken[...]" "Your turn!" "Token A12 is now being seen."
 *
 *   # or set the token once in your shell
 *   export EXPO_PUSH_TOKEN="ExponentPushToken[...]"
 *   node scripts/send-test-push.js
 *
 * Where do I get the token?
 *   Run a dev build (npx expo run:android), log in, and look for the line
 *   "[push] Expo push token: ExponentPushToken[...]" in the Metro console.
 *
 * Notes:
 *   • The device must be running a DEV or EAS build — Expo Go cannot receive
 *     push notifications (SDK 53+ dropped the native module).
 *   • `channelId: 'appointments'` matches ANDROID_CHANNEL_ID in
 *     services/notifications.ts, so the push uses the high-importance channel
 *     (heads-up banner + sound) rather than the silent default.
 *   • `data.audience` / `data.type` / `data.appId` mirror the shape the app's
 *     received-listener expects, so the test push also lands in the in-app
 *     notification centre — exactly like a real backend push.
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const RECEIPT_URL = 'https://exp.host/--/api/v2/push/getPushNotificationReceipts';

const token = process.argv[2] || process.env.EXPO_PUSH_TOKEN;
const title = process.argv[3] || '🔔 TokenWalla test';
const body =
  process.argv[4] || 'If you can see this, push notifications are working.';

if (!token) {
  console.error(
    'Error: no push token.\n\n' +
      '  node scripts/send-test-push.js "ExponentPushToken[...]"\n' +
      '  (or set EXPO_PUSH_TOKEN in your environment)\n',
  );
  process.exit(1);
}

if (!/^ExponentPushToken\[.+\]$/.test(token) && !/^ExpoPushToken\[.+\]$/.test(token)) {
  console.error(
    `Error: "${token}" does not look like an Expo push token.\n` +
      'It should look like: ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]\n',
  );
  process.exit(1);
}

const message = {
  to: token,
  sound: 'default',
  title,
  body,
  priority: 'high',
  channelId: 'appointments',
  badge: 1,
  data: {
    screen: 'my-bookings',
    type: 'test',
    audience: 'patient',
    appId: `test-${Date.now()}`,
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`→ Sending to ${token}\n  title: ${title}\n  body:  ${body}\n`);

  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'accept-encoding': 'gzip, deflate',
      'content-type': 'application/json',
    },
    body: JSON.stringify(message),
  });

  const json = await res.json().catch(() => null);

  if (!res.ok || !json) {
    console.error(`✗ HTTP ${res.status} from Expo push service`);
    console.error(json ?? '(no JSON body)');
    process.exit(1);
  }

  // Top-level errors (bad request shape, etc.)
  if (json.errors) {
    console.error('✗ Expo rejected the request:');
    console.error(JSON.stringify(json.errors, null, 2));
    process.exit(1);
  }

  const ticket = Array.isArray(json.data) ? json.data[0] : json.data;

  if (!ticket) {
    console.error('✗ Unexpected response:', JSON.stringify(json, null, 2));
    process.exit(1);
  }

  if (ticket.status === 'error') {
    console.error(`✗ Ticket error: ${ticket.message}`);
    if (ticket.details?.error === 'DeviceNotRegistered') {
      console.error(
        '\n  This token is stale — the app was uninstalled, or the token was\n' +
          '  regenerated after a rebuild. Grab a fresh one from the Metro logs.',
      );
    }
    if (ticket.details) console.error('  details:', JSON.stringify(ticket.details));
    process.exit(1);
  }

  console.log(`✓ Accepted by Expo (ticket ${ticket.id})`);
  console.log('  Checking delivery receipt in 3s…\n');

  // A ticket only means Expo accepted it. The receipt says whether FCM/APNs
  // actually delivered it — that's where credential problems show up.
  await sleep(3000);

  const rres = await fetch(RECEIPT_URL, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ ids: [ticket.id] }),
  });

  const rjson = await rres.json().catch(() => null);
  const receipt = rjson?.data?.[ticket.id];

  if (!receipt) {
    console.log('… receipt not ready yet. Re-check later with:');
    console.log(
      `  curl -s -H "content-type: application/json" -d '{"ids":["${ticket.id}"]}' ${RECEIPT_URL}`,
    );
    return;
  }

  if (receipt.status === 'ok') {
    console.log('✓ Delivered. It should be on the device now.');
    console.log('\n  Nothing showed up? Check:');
    console.log('   • Notifications enabled for TokenWalla in Android settings');
    console.log('   • Battery optimisation is not restricting the app');
    console.log('   • You are on a dev/EAS build, not Expo Go');
  } else {
    console.error(`✗ Delivery failed: ${receipt.message}`);
    if (receipt.details) console.error('  details:', JSON.stringify(receipt.details));
    if (receipt.details?.error === 'MismatchSenderId') {
      console.error(
        '\n  google-services.json does not match the FCM credentials uploaded\n' +
          '  to EAS. Re-upload with: eas credentials',
      );
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('✗ Request failed:', err.message);
  process.exit(1);
});
