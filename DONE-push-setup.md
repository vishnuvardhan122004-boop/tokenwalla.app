> ✅ **COMPLETED 2026-07-21** — Android push notifications are confirmed working on-device.
> All steps below are done (Firebase project, `google-services.json`, FCM V1 key uploaded).
> Kept as reference only. No action needed.

# ~~Tomorrow~~ — finish Android push (the manual, hands-on steps) — DONE

Everything code-side is done and verified green. What's left needs **your Google login (browser)** and **a physical Android phone** — that's why it couldn't run overnight. Do these in order; ~20–30 min total.

Prep already done for you tonight:
- `.gitignore` now ignores `google-services.json` / `GoogleService-Info.plist`
- `doctor/[id].jsx` → `.tsx` with full types (now type-checked)
- Full audit re-run: `tsc`, `eslint`, `expo export` all pass
- Client already registers push tokens on patient-home + hospital-dashboard mount (shipped in `d29d961`)

---

## 1. Create the Firebase project + Android app
1. Go to https://console.firebase.google.com → **Add project** (name it e.g. `TokenWalla`). Google Analytics is optional — skip it.
2. In the project, click the **Android** icon to add an Android app.
3. **Android package name** — must be exactly:
   ```
   com.vishnu2004.Tokenwalla
   ```
4. Skip the SHA-1 and the "add SDK" Gradle steps (EAS handles native wiring). Just **Download `google-services.json`**.

## 2. Drop the file in + wire app.json
1. Move the downloaded file to the **project root**:
   ```
   /Users/kvishnuvardhan/Desktop/app /Tokenwalla/google-services.json
   ```
   (It's gitignored, so it won't be committed — that's intended.)
2. Add ONE line to `app.json` inside the `"android": { … }` block (e.g. right after `"predictiveBackGestureEnabled": false,`):
   ```json
   "googleServicesFile": "./google-services.json",
   ```
   > Do NOT add this line before the file exists — `expo` can't parse the config without it and will drop the `extra` block (apiBaseUrl / Razorpay key). That's why I left it out tonight.
3. Sanity check it parses:
   ```bash
   npx expo config --json | grep -i googleservices   # should show the path, no "Could not parse" warning
   ```

## 3. Upload the FCM V1 key to EAS
Expo delivers Android push only through FCM V1. You need a Google service-account key uploaded to the Expo project.
```bash
eas credentials
```
- Platform → **Android**
- Choose the **production** build profile
- Select **Google Service Account** → **Manage your Google Service Account Key for Push Notifications (FCM V1)**
- Follow the prompt to upload the key. To get the key JSON: Firebase Console → ⚙️ **Project settings** → **Service accounts** → **Generate new private key** → upload that JSON when `eas credentials` asks.

(EAS is logged in as `vishnu2004`. iOS/APNs needs none of this — auto-provisioned.)

## 4. Build a testable APK
Preview profile gives an installable APK (faster/cheaper than a store `.aab`):
```bash
eas build --platform android --profile preview
```
Wait for the build, download the APK to the phone, install it.

## 5. Verify token registration
1. Open the app on the phone, log in as a patient (and/or hospital).
2. Django admin → **Notifications → DeviceTokens** — you should see a new row for that device/role.
   - No row? Check the app has notification permission granted and that `registerPushToken` ran on home-screen mount.

## 6. Fire a real push end-to-end
1. From the hospital side, advance one of that patient's bookings to **in_progress**.
2. The patient's phone should get the **"You're next"** push.
   - If the token registered but no push arrives → re-check the FCM V1 key upload (step 3) and that `google-services.json` was actually bundled into the build.

---

## Also worth doing before the next Play Store submission (not blocking push)
- **Data Safety form**: declare location use (ACCESS_FINE/COARSE — "find doctors near you") so it matches the in-app privacy screen, or review may reject.

## The 3 green-checks command (run anytime to confirm the app still builds)
```bash
npx tsc --noEmit
npx eslint app components services utils --quiet
npx expo export --platform android      # then: rm -rf dist
```
