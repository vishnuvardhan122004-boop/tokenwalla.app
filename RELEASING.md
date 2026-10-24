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
doctor-late timer (#63) and the quick-hours buttons (#66). Its tally row is
added after the build, with the versionCode and the `main` commit.

Five production builds for one release in October is the pattern this rule
exists to stop: test on `preview` / `development`, build `production` only for
the release itself.
