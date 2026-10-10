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
| 2026-10 | 45 | 1.5.1 | ≤ 2026-10-03 | — | **? — on Play by 2026-10-03; upload date not recorded** |
| 2026-10 | 46 | 1.5.2 | 2026-10-03 | `c038bf8` | no: superseded, never released |
| 2026-10 | 47 | 1.5.2 | 2026-10-03 | `2e2a2e9` | no: superseded, never released |
| 2026-10 | 48 | — | 2026-10-04 | `cb312f9c` | no: build ERRORED, code spent |
| 2026-10 | 49 | 1.5.2 | 2026-10-04/05 | `6c33e887` | no: built, never uploaded |
| 2026-10 | 50 | 1.5.2 | 2026-10-05 | `14d888a` | **yes** (uploaded 2026-10-09) |

**October 2026: at least 1 of 2 used (vc50).** If 1.5.1 / vc45 was also
uploaded in October, both are used, and vc51 this month is a third release that
needs Vishnu's explicit go-ahead. Settle it from Play Console's release history
and fix the vc45 row.

Five production builds for one release in October is the pattern this rule
exists to stop: test on `preview` / `development`, build `production` only for
the release itself.
