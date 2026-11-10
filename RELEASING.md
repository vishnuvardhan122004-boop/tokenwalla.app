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
| 2026-11 | 56 | 1.9.0 | 2026-11-10 | `04e5ebe` | built, **pending upload** (counts once Vishnu uploads it). November's 2nd of 2. Ships #86 (reschedule ₹12 + cap) and #87 (desk-staff PIN picker) |

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
