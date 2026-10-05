# Play Data Safety — answers for TokenWalla

Drafted 2026-08-22 from what the code actually does, for **v1.3.x** (scan reports
shipped in 1.3.0). Every row below cites the thing that makes it true, so when
the answer changes you can tell *why* it changed.

**You submit this, not Claude.** It is a declaration Google holds you to, and a
mismatch between this form and the in-app privacy screen is itself a rejection
reason. Read each row, disagree with any you think is wrong, then fill the form.

---

## ⚠️ Blocker to fix first: there is no account deletion path

Google requires any app with account creation to offer **in-app account deletion
plus a publicly reachable web URL** for deletion requests. TokenWalla has
neither — `grep` for `delete_account` / `DeleteAccount` across the backend and
the app returns nothing.

The Data safety form asks about this directly, so you will hit it while filling
this in. This is a policy requirement in its own right, independent of the health
declaration, and it applies to the app already in Production.

Minimum to satisfy it: a `DELETE /api/auth/me/` that anonymises or removes the
user and their bookings, a "Delete account" row in the app's profile screen, and
a public page (the website is fine) describing how to request deletion. Say the
word and I will build it.

---

## Section 1 — Data collection and security

| Question | Answer | Why |
|---|---|---|
| Does your app collect or share any of the required user data types? | **Yes** | See section 2 |
| Is all of the user data collected by your app encrypted in transit? | **Yes** | Base URL is HTTPS (`expo.extra.apiBaseUrl`); a repo-wide grep finds no `http://` in `app/`, `components/`, `utils/`; no `usesCleartextTraffic` in the manifest |
| Do you provide a way for users to request that their data is deleted? | **No — see blocker above** | No deletion endpoint or UI exists today. Answering "Yes" here would be false |

## Section 2 — Data types

### Personal info

| Type | Collected | Shared | Optional? | Purposes |
|---|---|---|---|---|
| **Name** | Yes | No | Required | App functionality, Account management |
| **Phone number** | Yes | No | Required | App functionality, Account management |
| Email address | **No** | — | — | Nothing reads `User.email` — verified by grep |
| Address | **No** | — | — | Hospital addresses are business data, not user data |
| **User IDs** | Yes | No | Required | App functionality — `mobile` is `USERNAME_FIELD` |

`Booking.booked_for_name` / `booked_for_mobile` mean a user can enter **someone
else's** name and number when booking on their behalf. That is still "Name" and
"Phone number" collected; no extra type is needed, but it is worth a line in the
privacy policy.

**On "Shared":** OTPs go to 2Factor and WhatsApp messages to Meta. Google treats
transfers to service providers processing on your behalf as *not* sharing, so
**No** is correct — provided your privacy policy names them as processors. If it
doesn't, add them rather than flipping this to Yes.

### Health and fitness — **this is the new one**

| Type | Collected | Shared | Optional? | Purposes |
|---|---|---|---|---|
| **Health info** | **Yes** | No | Required (for the scan feature) | App functionality |

What makes it health info, concretely:
- **Scan reports** — `ScanReport.file`, uploaded by a centre (`app/(hospital)/(tabs)/dashboard.tsx`)
  and downloaded by the patient (`app/(patient)/my-bookings.tsx`). Medical documents,
  transmitted off-device to the backend and Cloudinary.
- **The scan or doctor booked** — modality (MRI, CT, blood work) and specialisation
  reveal a health condition even without a report attached.

This is the row that is missing today and the reason this form needs resubmitting.

### Financial info

| Type | Collected | Shared | Optional? | Purposes |
|---|---|---|---|---|
| **Purchase history** | Yes | No | Required | App functionality |
| Payment info (card, bank) | **No** | — | — | Razorpay Checkout collects it inside its own WebView; the app sends only `order_id` and never receives card data — `app/(patient)/payment.tsx:311-317` |

### Location

| Type | Collected | Shared | Optional? | Purposes |
|---|---|---|---|---|
| **Approximate location** | Yes | No | **Optional** | App functionality |
| **Precise location** | Yes | No | **Optional** | App functionality |

Already declared 2026-07-21. `ACCESS_COARSE_LOCATION` + `ACCESS_FINE_LOCATION`
are the app's only two Android permissions. Mark **Optional** — the app works if
the user declines and searches by city instead.

### Photos and videos

| Type | Collected | Shared | Optional? | Purposes |
|---|---|---|---|---|
| **Photos** | Yes | No | Optional | App functionality |

`expo-image-picker` / `expo-camera` — profile and hospital images, and the QR
scanner. The QR camera is ephemeral (frames are processed and discarded), but the
uploaded images are stored, so declare Photos as collected.

### Files and docs

| Type | Collected | Shared | Optional? | Purposes |
|---|---|---|---|---|
| **Files and docs** | Yes | No | Required (centre role) | App functionality |

`expo-document-picker` — the scan-report upload. This overlaps with Health info
above; Google expects **both** rows, since the file type and its medical nature
are separate facts.

### App info and performance

| Type | Collected | Shared | Optional? | Purposes |
|---|---|---|---|---|
| **Crash logs** | Yes | No | Required | Analytics |
| **Diagnostics** | Yes | No | Required | Analytics |

Sentry (`services/sentry.ts`), `tracesSampleRate: 0.2`. Note it does **not** set
`sendDefaultPii` and never calls `setUser`, so no name, mobile or booking data is
attached to a crash — which is why no personal-info row is needed for Sentry.

### Device or other IDs

| Type | Collected | Shared | Optional? | Purposes |
|---|---|---|---|---|
| **Device or other IDs** | Yes | No | Required | App functionality |

The Expo push token, stored server-side as `DeviceToken`, used to deliver booking
and queue notifications.

---

## Not collected — do not tick these

Race/ethnicity, political or religious beliefs, sexual orientation, other personal
info, contacts, calendar, SMS/call logs, browsing history, installed apps, search
history, audio, music, and in-app messages. Nothing in the codebase touches any of
them.

---

## After you submit

1. Make the in-app privacy screen and the website privacy policy say the same
   thing — specifically that **medical scan reports are uploaded and stored**, and
   that 2Factor and Meta process phone numbers on TokenWalla's behalf. A form that
   disagrees with the policy is a rejection reason on its own.
2. Re-check this file whenever a native module is added or a new field starts
   being stored — a new picker or a new stored field usually means a new row here.
   The rest of the release gates live in the `production-release-checklist` memory.
