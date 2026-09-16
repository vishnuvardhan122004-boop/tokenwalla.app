# Changelog

Notable patient/hospital-visible changes, newest on top. Version bumps happen
in `app.json`/`package.json` at release-cut time (see `chore(release)`
commits); this file exists so the full list for a build survives past any
one commit message, including fixes that land after the version was cut.

## 1.5.0

Two features + nine fixes since 1.4.0:

- Appointment Pass: offer and spend it at checkout, visible to guests too
- Doctor Running Late: buttons, patient banner, notification icon
- Signup no longer hides *why* a password was rejected (too common,
  all-numeric, or too similar to your phone number) — it used to fall back
  to a generic "Registration failed" even though the server had already
  computed the real reason
- Android release builds now run R8/ProGuard obfuscation + resource
  shrinking
- Fixes: OTP token race on 6 flows, reschedule double-charge, doctor
  date-selection race, hospital payout caption, hospital reset-OTP copy,
  Saturday support hours, scan/blood-test fee label
- Perf: memoized derived lists on the four heaviest screens, image caching,
  gated polling

Minor rather than patch: Appointment Pass and Doctor Running Late are new
patient-facing features, not just fixes.
