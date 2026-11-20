# Releasing the app — a rule, set by Vishnu 2026-10-10

**Build locally as often as you like. Release to production at most TWICE a
calendar month.**

- **Local and test builds — unlimited.** `npx expo start` (Expo web, simulator),
  `npx expo run:android` / `run:ios`, or EAS with the **`development`** or
  **`preview`** profile (`eas build --local --profile preview` gives an APK).
  Merging to `main` is fine at any time too; it ships nothing.
- **Never use the `production` profile to test.** It has `autoIncrement` against
  a remote version source (`eas.json`), so every run, even one that errors,
  spends a versionCode for good. That is how vc48 was burned.
- **Production releases — at most 2 per calendar month.** A production release
  is a `production`-profile build uploaded to the Play Store (or App Store).
  Batch the merged fixes into them instead of shipping each one.
- **Before starting a production build:** count this month's releases in the
  tally below and say the number. Start one only when it is going to be
  uploaded. A third in the same month needs Vishnu's explicit go-ahead in the
  session, with the reason.
- **After every production build:** add a row below (versionCode, version,
  date, `main` commit, uploaded or not). A build that errored or was never
  uploaded does not count against the two, but it still gets a row, because it
  still spent a versionCode.

## Unreleased native changes (read before the next production build)

Most merged fixes are JavaScript. These add or change **native code**, so they
reach users only in a new store build, and they cannot be tried in Expo Go. Test
them on a `development` or `preview` build, never on `production`.

- **Continue with Google** (`@react-native-google-signin/google-signin` 16.2.0,
  ROADMAP 62 slice 3). Android only. Needs an **Android OAuth client** in Google
  Cloud (package `com.vishnu2004.Tokenwalla`) with the **SHA-1** of every key that
  signs a build: the EAS keystore (`eas credentials`) and the Play app-signing key
  (Play Console → Setup → App signing). Without a matching SHA-1 the picker fails
  with `DEVELOPER_ERROR`. The Web client ID is in `app.json` `extra.googleWebClientId`.

## Tally

Production-profile builds and store releases since the rule's first month.
"Counts" means uploaded to the store as a production release.

| Month | versionCode | Version | Built | `main` commit | Counts? |
|---|---|---|---|---|---|
| 2026-10 | 44 | 1.5.0 | 2026-10-02 | `9d733bf` | **yes** (live on Play 2026-10-02, per WORKLOG) |
| 2026-10 | 45 | 1.5.1 | ≤ 2026-10-03 | `3001b8f` | **yes** (on Play by 2026-10-03) |
| 2026-10 | 46 | 1.5.2 | 2026-10-03 | `c038bf8` | no: superseded, never released |
| 2026-10 | 47 | 1.5.2 | 2026-10-03 | `2e2a2e9` | no: superseded, never released |
| 2026-10 | 48 | — | 2026-10-04 | `cb312f9c` | no: build ERRORED, code spent |
| 2026-10 | 49 | 1.5.2 | 2026-10-04/05 | `6c33e887` | no: built, never uploaded |
| 2026-10 | 50 | 1.5.2 | 2026-10-05 | `14d888a` | **yes** (uploaded 2026-10-09) |
| 2026-10 | 51 | 1.6.0 | 2026-10-15 | `a415290` | **yes** (uploaded 2026-10-15) |
| 2026-10 | 52 | 1.6.1 | 2026-10-16 | `6a932e6` | **yes** (uploaded 2026-10-16, on go-ahead) |
| 2026-10 | 53 | 1.7.0 | 2026-10-24 | `8dc364e` | **yes** (uploaded; Vishnu updated to it and checked it 2026-10-25) |
| 2026-10 | 54 | 1.8.0 | 2026-10-29 | `67c6ba1` | built, **pending upload** (counts once Vishnu uploads it) |
| 2026-11 | 55 | 1.8.0 | 2026-11-09 | `1b94080` | **yes** (uploaded to Play by Vishnu 2026-11-09). Same versionName as vc54 |
| 2026-11 | 56 | 1.9.0 | 2026-11-10 | `04e5ebe` | no: **superseded by vc57, never uploaded. Do not upload it** (it would make vc57 a 3rd November release) |
| 2026-11 | 57 | 1.9.0 | 2026-11-10 | `c8bbf77` | no: **superseded by vc58, never uploaded. Do not upload it** (it would make vc58 a 3rd November release). Was November's 2nd of 2, in place of vc56. Ships everything vc56 had (#86 reschedule ₹12 + cap, #87 desk-staff PIN picker) plus #90 (add/edit staff in the app, compulsory mobile, PIN shown once) and #91 (My earnings after a PIN sign-in) |
| 2026-11 | 58 | 1.9.0 | 2026-11-10 | `f4f9c69` | built, **pending upload** (counts once Vishnu uploads it). November's 2nd of 2, in place of vc57. Ships everything vc57 had plus #93 (one-tap who-handled picker on scan and Done, 10 s Change, payee name, no popup while the incentive is off, staff Delete, +91-safe 6-9 mobile rule, PIN bar is My earnings only) |
| 2026-11 | 59 | 1.10.0 | 2026-11-12 | `ae20ad1` | **yes** (uploaded to Play, confirmed by Vishnu 2026-11-16). November's 2nd of 2: vc58 was skipped. Build `f054978f`. Supersedes vc58: skip vc58 and this is November's 2nd of 2; upload both and it is the 3rd, on Vishnu's explicit go-ahead in session 2026-11-12. Ships everything vc58 had plus #100/#101 (My earnings opens after the PIN, Today tile, period chips, live today count), #102 (priority card: amount paid and amount to collect), #103/#107 (leftover English fixed in hi/te/kn, Sign In double-tap guard), #104 (doctor, hospital, specialty and city names transliterated into the patient's language, bell cleared for a different account), #105/#106 (About, Privacy, Refund, Terms with the real 70/60/50/0 refund tiers and the YouTube link). File: `~/Desktop/app/releases/tokenwalla-1.10.0-vc59.aab`. |
| 2026-11 | 60 | 1.11.0 | 2026-11-16 | `32e80df` | **yes** (uploaded to Play by Vishnu, still in review on 2026-11-17, per Vishnu). November's **3rd**, on Vishnu's explicit go-ahead in session 2026-11-16 ("Yes, build 3rd"). Build `7ebf2999`. File: `~/Desktop/app/releases/tokenwalla-1.11.0-vc60.aab`. |
| 2026-11 | 61 | 1.12.0 | 2026-11-18 | `be55b54` | no: **superseded by vc62, never uploaded. Do not upload it** (it would make vc62 a 5th November release). Was November's 4th, on Vishnu's explicit go-ahead in session 2026-11-17 ("Build it now", after being told vc55, vc59 and vc60 were uploaded; vc60 still in review). Build `f19241c1`. File: `~/Desktop/app/releases/tokenwalla-1.12.0-vc61.aab`. |
| 2026-11 | 62 | 1.12.0 | 2026-11-19 | `cbab27d` | no: **superseded by vc63, never uploaded. Do not upload it** (it would make vc63 a 5th November release). Was November's 4th, in place of vc61, on Vishnu's explicit go-ahead in session 2026-11-19 ("Replace vc61 with vc62", after being told the count). Ships everything vc61 had plus #123 (the doctor's Before you come note), #124 (queue position only on the day; shop token says ask the shop), #125 (PhonePe / GPay / Paytm open from the in-app Razorpay checkout) and #126 (book-for-someone-else sent with the order, web ROADMAP 76f). File: `~/Desktop/app/releases/tokenwalla-1.12.0-vc62.aab`. |
| 2026-11 | 63 | 1.13.0 | 2026-11-20 | `d8b3075` | no: **superseded by vc64, never uploaded. Do not upload it.** Play Console refused it for review: `android.hardware.screen.portrait` required (the Google code scanner's portrait-locked activity). Was November's 4th, in place of vc62, on Vishnu's explicit go-ahead in session 2026-11-20 ("vc62 NOT uploaded, build", after being told vc55, vc59 and vc60 were uploaded). Build `f083ba05`. Ships everything vc62 had plus #129 (offer prices: single booking shown ₹35 struck out, charged ₹26; pass ₹40 with ₹55 struck out; the fallback fee mirror updated) and the promo code box on the payment screen (first booking, server-judged, en/hi/te/kn). The server already has the matching rules (web #309, #312: an influencer can't use their own code). File: `~/Desktop/app/releases/tokenwalla-1.13.0-vc63.aab`. |
| 2026-11 | 64 | 1.13.0 | 2026-11-20 | `f7ae768` | built, **pending upload** (counts once Vishnu uploads it). November's **4th**, in place of vc63 (and vc62), on Vishnu's explicit go-ahead in session 2026-11-20 ("Yes, build vc64"). Build `84ef2230`. Same as vc63 plus #132: `android.hardware.screen.portrait` declared `required="false"` so Play stops treating the portrait-locked Google code scanner as a required portrait screen; read back out of the built .aab's merged manifest. File: `~/Desktop/app/releases/tokenwalla-1.13.0-vc64.aab`. |

**October 2026: 3 of 2 used (vc44, vc45, vc50)**, on repo evidence; the rule
was only set on 2026-10-10, after all three. **vc51 (1.6.0) is a 4th, released
on Vishnu's explicit go-ahead in session 2026-10-15.** Reason: installed apps
log hospitals out on an ordinary token expiry (#49), show "couldn't load" for
centres the server now hides (#51), and lack priority booking, which is live
on the web (#55). Play Console → Release history can still correct the
vc44/vc45 dates.

**vc52 (1.6.1) is a 5th, on Vishnu's explicit request in session
2026-10-16** ("build a app with new version code", after being told the
count). Reason: ships #58 (Home's Hospitals stat → hospital list → hospital
page with its doctors), merged after vc51 was cut.

**1.7.0 is a 6th, on Vishnu's explicit request in session 2026-10-24**
("build for aab ... to upload with playstore", after being told the count: five
uploaded in October, and November 1 was the alternative). Reason: ships the
website-parity features (#68: test search, tests-first browse results, the
doctor's instructions and a test's prep on the token, select-and-bulk edit or
delete, CSV price-list import, the GST receipt from My Bookings), the Services →
Tests freeze fix for centres with hundreds of tests (#67), and merged work no
build carries yet: the walk-in token (#60), QR auto-confirm (#61), the
doctor-late timer (#63), the quick-hours buttons (#66), the running-late draft
fix (#64) and the delay reason on the patient banner (#65).

Built 2026-10-24 as **vc53** from `main` `8dc364e` (EAS build `386604c3`, signed
with the same remote keystore as vc44 to vc52). The `.aab` is 73,673,439 bytes,
SHA-256 `3410d10f7bc5b9e7d058704e6d564d2462a75be15394994a48260a18f525d594`.
Checked before the build: 543 jest tests, `tsc`, lint, `expo export`, `expo-doctor`
(17 of 18; the one miss is Expo patch drift), the live API on the current website
`main` with every endpoint this build calls present. After Play shows 1.7.0 live,
set `APP_LATEST_VERSION=1.7.0` on Railway (Vishnu's; `APP_MIN_VERSION` stays empty). Still `1.6.1` when checked on 2026-10-25.

**1.8.0 is a 7th, on Vishnu's explicit request in session 2026-10-29**
("Merged, build now", after being told the count: six uploaded in October, and
November 1 was the alternative). Reason: ships the six features merged since
vc53 that no build carries: the redesigned home (#72), the sign-up sheet on the
login screen (#73), the walk-in button removed from the hospital queue (#74),
the city-tap question (#75), the clinic QR poster (#76) and the book-ahead
window (#77), plus the Expo patch bumps (54.0.37) and the lint clean-up (#78).

Built 2026-10-29 as **vc54** from `main` `67c6ba1` (EAS build `7e6edb8f`, signed
with the same remote keystore as vc44 to vc53: identical signing-cert SHA-256).
The `.aab` is 73,681,803 bytes, SHA-256
`bf84673dbcf2b926a81c7defb2321cfe99afca0ed9981fc8b6481d0e156bedcb`, kept at
`~/Desktop/app/releases/tokenwalla-1.8.0-vc54.aab`. Checked before the build:
634 jest tests, `tsc`, lint (0 errors), `expo export`, `expo-doctor` (18 of 18),
the live API on the current website `main` with every endpoint this build calls
present, and the screens above on Expo web against a local API. Checked in the
file: version 1.8.0, the Railway `apiBaseUrl`, a live Razorpay key (a store
build, so expected), Sentry set, and the same four permissions as vc53. Not
checked: any Android device run (the preview build was canceled, so the Expo
patch bumps met a native build for the first time here). After Play shows 1.8.0
live, set `APP_LATEST_VERSION=1.8.0` on Railway (Vishnu's; `APP_MIN_VERSION`
stays empty).

**vc55 (1.8.0) is November's 1st release** (2026-11-09, on Vishnu's "build it" after #84). Ships what vc54 lacked: Continue with Google (#82), the leave day (#81), the staff incentive (#80), the doctor photo viewer and the Hospital Contact row on the token (#84). Built from `main` `1b94080` (EAS build `1b788300`), `.aab` 73,955,010 bytes, SHA-256 `944e676edd394ef7397c21106e032e13fbc9e7dd7f894f6e058570fc7e18099b`, kept at `~/Desktop/app/releases/tokenwalla-1.8.0-vc55.aab`. Checked before the build: tsc, 687 jest. **Not checked: any device run** (no `preview` build was made, so Google sign-in and the Expo patch bumps are untried on Android). The versionName is still 1.8.0, same as vc54, so `APP_LATEST_VERSION=1.8.0` will not prompt anyone already on vc54. `RECORD_AUDIO` appears to still be in the manifest (ROADMAP: set `recordAudioAndroid: false`). Whether vc54 was ever uploaded is not recorded: if it was in November, November is at 2 of 2.

Five production builds for one release in October is the pattern this rule
exists to stop: test on `preview` / `development`, build `production` only for
the release itself.

**vc57 (1.9.0) replaces vc56 as November's 2nd release** (2026-11-10, on Vishnu's "build vc57"). vc56 was built but never uploaded, so it doesn't count, and its versionName 1.9.0 never reached Play. vc57 keeps 1.9.0 and needed no version bump. Built from `main` `c8bbf77` (EAS build `b339e82d`), `.aab` 73,964,366 bytes, SHA-256 `a0245d94c45bc049ff7e576d764e56ccd95f4f8d5124e6dc3cb4b8f3352941e1`, kept at `~/Desktop/app/releases/tokenwalla-1.9.0-vc57.aab`. Signing cert SHA-256 `25:84:35:…:9A:6C`, the same as vc55 and vc56. Checked before the build: jest 703, tsc, `expo lint .` 0 errors, `expo export --platform android`, expo-doctor 18/18, no localhost/LAN URLs. The baked config has the Railway apiBaseUrl and the publishable live payment key. The live API was already on web `091a17b` (#252), and `POST /hospitals/<pk>/staff/me/` answered 401, not 404. **Not checked: any device run.** The features were checked on Expo web against a local API. `RECORD_AUDIO` is still in the manifest.

**vc58 (1.9.0) replaces vc57 as November's 2nd release** (2026-11-10, on Vishnu's "Build vc58 instead"). vc57 was built but never uploaded, so it doesn't count; 1.9.0 has still never reached Play, so no version bump. Built from `main` `f4f9c69` (EAS build `10ca3dad`), `.aab` 73,970,831 bytes, SHA-256 `6d971815255894a792c1939e9af13b2cd66c71fe19a5c7eb420c2e3de144604c`, kept at `~/Desktop/app/releases/tokenwalla-1.9.0-vc58.aab` (`unzip -t` clean). Signing cert SHA-256 `25:84:35:…:9A:6C`, the same as vc55 and vc57. The bundle has the new strings (`handled-by`, "Change who handled it", "Whose earnings?") and not the old "credited to this person". Checked before the build: jest 717, tsc, `expo lint .` 0 errors, `expo export --platform android`, expo-doctor 18/18, no localhost/LAN URLs. Baked config: Railway apiBaseUrl, the publishable live payment key. The live API was already on web `c22a46bd` (#253), and `PATCH /bookings/handled-by/1/`, `GET /hospitals/1/staff/` and `GET /payment/incentives/detail/` answered 401, not 404. **Not checked: any device run.** The features were checked on Expo web against a local sandbox API. `RECORD_AUDIO` is still in the manifest.


**vc60 (1.11.0) is November's 3rd release** (2026-11-16, on Vishnu's explicit go-ahead in session, after being told vc59 was the 2nd of 2 and that December 1 was the alternative). Ships what vc59 lacked: #110 (doctors ranked by taps and completed bookings), #111 (axios 1.21.0), #112 (text no longer runs out of buttons on phones, "Andhra Pradesh" copy), #113 ("Stationery or medical shop? Register here" on login), #114 (the password eye stays inside the field beside Get OTP). Built from `main` `32e80df` (EAS build `7ebf2999`), `.aab` 74,000,333 bytes, SHA-256 `e2631d9d2da258fcc821ce11684ac7465f2d1c785a8d4ac2e108c0517484bbf0`, `unzip -t` clean. Signing cert SHA-256 `25:84:35:…:9A:6C`, the same as vc55 to vc59. Baked config: version 1.11.0, Railway apiBaseUrl, the publishable live payment key, Sentry. Checked before the build: jest 761, tsc, `expo lint .`, `expo export --platform android`, expo-doctor 18/18, no localhost/LAN URLs; login, home and doctors list on Expo web at 360px in English and Telugu. The live API was on web `faf0c0e` (= website `main`) and already returns `booking_count` and `view_count`. **Not checked: any device run.** `RECORD_AUDIO` is still in the manifest. After Play shows 1.11.0 live, set `APP_LATEST_VERSION=1.11.0` on Railway (Vishnu's).

**vc61 (1.12.0) is November's 4th release** (built 2026-11-18, on Vishnu's explicit go-ahead in session 2026-11-17 after being told the count; vc60 was uploaded but still in review, and he wanted a newer build). Ships what vc60 lacked: #117 (keyword chips for a saved list), #118 (R8 optimisation with Expo's keep rules), #119/#120 (a token booked for someone else shows in their My Bookings, view-only; My QR names who paid and drops the "pay at the hospital" note when the full fee was paid online). Built from `main` `be55b54` (EAS build `f19241c1`), `.aab` 74,799,517 bytes, SHA-256 `952e91be852a36276c234687bbbd42f04a38a446d37b633c3983d5ff4473d5c7`, `unzip -t` clean. Signing cert SHA-256 `25:84:35:…:9A:6C`, the same as vc55 to vc60. Baked config: version 1.12.0, Railway apiBaseUrl, the publishable live payment key, Sentry. Checked before the build: jest 784, tsc, `expo lint .`, `expo export --platform android`, expo-doctor 18/18, no localhost/LAN URLs; the shared-token and My QR screens on Expo web against a local API. The live API was on web `42704f78` (= website `main`). **Not checked: any device run of this build**; #118's R8 change was tried only as a preview APK. `RECORD_AUDIO` is still in the manifest. After Play shows 1.12.0 live, set `APP_LATEST_VERSION=1.12.0` on Railway (Vishnu's).

**vc62 (1.12.0) replaces vc61 as November's 4th release** (built 2026-11-19, on Vishnu's explicit go-ahead in session after being told vc55, vc59 and vc60 were uploaded and vc61 was built but not; answer "Replace vc61 with vc62"). vc61 was never uploaded, so it doesn't count, and 1.12.0 has never reached Play, so no version bump. Ships what vc61 lacked: #123 and #124, and chiefly #125 (Razorpay checkout passes `webview_intent: true` and the payment WebView hands `upi://` / `intent://` links to the phone, so PhonePe / GPay / Paytm open; a missing app says so in four languages) and #126 (create-order carries book-for-someone-else, so the server's Razorpay webhook, live and proven 2026-11-19, books for the right person). Built from `main` `cbab27d` (EAS build `a586945a`), `.aab` 74,801,465 bytes, SHA-256 `5c1d6f91400197cca5267005d13d4940735d7a405c8d0025c12266b9f4ab354b`, `unzip -t` clean. Signing cert SHA-256 `25:84:35:…:9A:6C`, the same as vc55 to vc61. Baked config: version 1.12.0, Railway apiBaseUrl, the publishable live payment key, Sentry; the bundle has the new UPI and order code. Checked before the build: jest 802, tsc, `expo lint .` 0 errors, `expo export --platform android`, expo-doctor 18/18, no localhost/LAN URLs. The live API was on web `b56c784` (= website `main`, includes the webhook #300/#301); `POST /payment/create-order/` and `/payment/verify/` answered 401, not 404. **Not checked: any device run of this build, and #125's UPI hand-off has never run on a phone** (Expo web has no WebView). `RECORD_AUDIO` is still in the manifest. After Play shows 1.12.0 live, set `APP_LATEST_VERSION=1.12.0` on Railway (Vishnu's).
