# Girvi Pawn Manager — Android app

Production React Native (Expo) rewrite of the AI Studio web prototype, with a
Supabase backend, real email/password accounts, multi-user shops, biometric app
lock, a rewritten interest engine and loan top-ups.

---

## 1. Why Supabase and not Firebase

For 10–20 users, personal use, and never wanting to pay:

| | Supabase Free | Firebase Spark (free) |
|---|---|---|
| Database | 500 MB Postgres | 1 GiB Firestore |
| Daily read/write caps | none | 50k reads / 20k writes per day |
| **File storage** | **1 GB included** | **not available — Cloud Storage needs the paid Blaze plan (billing card) on new projects** |
| Auth | email/password, 50k monthly users | email/password, unlimited |
| Access rules | Postgres RLS (SQL) | Firestore security rules |
| Card required | no | yes, once you need Storage |

Storage is the decider. This app photographs ornaments and KYC documents, and
on Firebase's free plan you either cannot store them at all or you stuff
base64 blobs into Firestore and burn through the 1 GiB quota and the daily read
caps. Supabase gives 1 GB of real file storage for free, plus SQL joins and
row-level security that make "each shop only sees its own rows" a few lines of
policy instead of hand-written rules.

The one Supabase caveat: a project is paused after **7 days with zero
requests**. A shop that opens the app on working days never hits this; if you
stop for a week, one click in the dashboard restores it. Nothing is deleted.

**Sizing check** — 20 loans/month with 3 photos each ≈ 60 photos. At the
~200 KB this app compresses them to, that is about **12 MB a year**, so the
1 GB bucket lasts decades. The text data will not reach 50 MB, let alone the
500 MB limit. You will not outgrow the free tier at 10–20 users.

---

## 2. Backend — already set up

The live backend is the Supabase project **Girvi-Mumbai**
(`lxohavutliiuexqbtwvg`, region `ap-south-1` / Mumbai — roughly 30 ms from a
phone in India instead of ~130 ms from Tokyo). The schema in
[`supabase/schema.sql`](supabase/schema.sql) has been applied to it, and
`.env` already holds that project's URL and publishable key, so the app runs as
soon as you build it.

What was applied: all seven tables, the RLS policies, the `private` membership
helpers, the three RPCs, the update triggers, and the `girvi-photos` bucket.

Verified live against the real database:

| Check | Result |
|---|---|
| A creates a shop, gets a store code | ✅ `create_store` returns the code |
| Outsider lists shops / customers / loans | ✅ sees 0 rows |
| Outsider writes using the **exact** store UUID | ✅ insert and update both blocked |
| B joins with the 6-character code | ✅ joins as STAFF, now sees the shop |
| STAFF records a customer | ✅ allowed |
| STAFF deletes a customer | ✅ blocked (0 rows) — owners only |
| Document numbering | ✅ `G-2026-0001`, `REC-2026-0001` |
| Security advisors | 3 notices, all for the intended RPCs |
| Performance advisors | no warnings |

All test rows and test users were deleted afterwards; the database is empty.

### If you ever need a fresh project

1. Create a project at [supabase.com](https://supabase.com), region **Mumbai
   (ap-south-1)**.
2. **SQL Editor → New query** → paste all of `supabase/schema.sql` → Run.
3. **Project Settings → API keys** → copy the *Project URL* and the
   *publishable* key into `.env` (see `.env.example`).

   Both are safe to ship inside the APK — the publishable key can only do what
   RLS allows, and RLS restricts every row to members of that row's shop. Never
   put the `service_role` key in the app; it bypasses RLS entirely.

Either way, finish the auth configuration:

5. **Authentication → Providers → Email**: keep *Enable email provider* on.
   - Leave *Confirm email* **on** for real security. The app handles it: sign-up
     parks the "create shop"/"join shop" intent and replays it after the user
     confirms and signs in.
   - Turning it off makes testing faster (sign-up drops you straight into the
     app). Turn it back on before you use the app for real money.
6. **Authentication → URL Configuration → Redirect URLs**: add both
   `girvi://reset-password` and `girvi://confirm-email`. Supabase silently
   falls back to the project's **Site URL** (often still the `localhost`
   default) for any `redirectTo`/`emailRedirectTo` that isn't in this
   allow-list — so without this step, sign-up confirmation and password-reset
   emails both open on a machine that isn't the phone, no matter what the app
   code passes. This is a manual dashboard step; nothing in the repo can set
   it for you.

---

## 3. Running it

> **Windows note:** do not keep this project in a folder whose name contains
> `&`. `cmd.exe` treats it as a command separator, so npm's `.bin` shims break
> with *"'…\node_modules\.bin\' is not recognized"*. Rename the folder (for
> example `girvi-pawn-manager`) and everything works. If you cannot rename it
> right now, run the CLI through a **relative** path from PowerShell instead:
> `node ".\node_modules\expo\bin\cli" start`.

```bash
npm install
```

### Option A — Expo Go (fastest, no Android Studio)

> **No longer works as-is.** `lottie-react-native` (used for the loading
> animation) ships native code that isn't part of Expo Go's bundled module
> set, so `npx expo start` + scanning the QR code in plain Expo Go will fail
> to load the app. Use **Option B** (`npx expo run:android`) or an EAS dev
> client instead. Everything below this note describes the old Expo-Go-only
> workflow and is kept for when/if that dependency is removed again.

Every other native module this app uses is bundled into Expo Go SDK 54 — the
`expo-*` packages plus async-storage, netinfo, datetimepicker,
gesture-handler, reanimated, screens and safe-area-context.

```bash
npx expo start
```

Scan the QR code with Expo Go (client 54.0.8, SDK 54). Biometrics, the camera,
photo compression, printing and PDF sharing all work there.

Two Expo Go caveats:

- **Password-reset links.** In Expo Go the app's `girvi://` scheme does not
  exist, so the code sends whatever `Linking.createURL()` resolves to — an
  `exp://…/--/reset-password` URL. Add that exact URL to **Authentication →
  URL Configuration → Redirect URLs** in Supabase while testing. It changes
  when your LAN IP changes; a real build always uses `girvi://reset-password`.
- Expo Go shows its own splash and app icon rather than yours.

### Option B — development build / release APK

For your own icon, the `girvi://` scheme, and the build you actually install in
the shop:

```bash
npx expo run:android
```

That needs Android Studio and a connected device. After the first build,
`npx expo start` reloads JS instantly without rebuilding.

### Shipping an APK without installing Android Studio

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build -p android --profile preview
```

EAS builds in the cloud (free tier included) and gives you an APK link to
install on any phone. For the Play Store use `--profile production`, which
produces an `.aab`.

---

## 4. What was added on top of the prototype

### Authentication (new)
The prototype had a "passwordless" screen that let **anyone** in by typing any
email, and Firestore rules that read `allow read, write: if true` — the whole
database was world-readable. That is all gone.

- **Login** — real email + password through Supabase Auth.
- **Register** — name, email, password, and a choice of:
  - *Create new shop* → you become OWNER and get a 6-character **store code**;
  - *Join a shop* → enter the owner's store code and you join as STAFF.
- **Forgot password** — emails a reset link that deep-links back into the app.
- **Store gate** — a signed-in user with no shop is asked to create or join one.
- Every table is isolated per shop by row-level security, enforced by Postgres,
  not by the app.

**Deep-linked sign-in.** Both the password-reset and sign-up-confirmation
emails carry a `girvi://…?code=…` link (PKCE). `lib/supabase.ts` deliberately
turns off `detectSessionInUrl` — "React Native has no URL bar for the session
to come back through" — so `RootNavigator` completes the sign-in itself: it
reads the launch URL (cold start) or the `Linking` `url` event (already
running), pulls out `code`, and calls `supabase.auth.exchangeCodeForSession`.
That call fires `PASSWORD_RECOVERY` or `SIGNED_IN` depending on which flow
issued the code, so the existing `onAuthStateChange`/`applyPendingIntent`
logic takes it from there. Requires `girvi://reset-password` **and**
`girvi://confirm-email` on the Redirect URLs allow-list (§2, step 6) — a link
whose target isn't allow-listed silently redirects to the project's Site URL
instead, which is the "why does it open on localhost" failure mode.

### Biometric app lock (new)
`Settings → App lock & biometrics`:
- fingerprint / face unlock guarding an already signed-in session;
- a 4- or 6-digit backup PIN, hashed with a random salt in the device keystore,
  for when the sensor will not read wet hands;
- auto-lock after 0 / 1 / 5 / 15 minutes in the background;
- "Lock now" from the dashboard.

The lock is device-local and separate from the account — losing the phone does
not expose the ledger, and it never blocks a legitimate sign-in.

### Loan top-ups — "add money" (new)
`Pledge → Add money`. Records extra cash given against ornaments already held:

- the extra amount joins the same loan **from its own date**, so interest
  already accrued is untouched and later interest runs on the larger principal;
- optionally re-prices the loan from that date;
- a top-up on a settled pledge re-opens it;
- generates a numbered voucher you can print;
- the before/after panel shows the revised principal and loan-to-value.

### Interest engine (rewritten)
`src/utils/interest.ts` replays each loan as a timeline of events — top-ups,
payments and compounding cycles — instead of applying one formula. That is what
lets top-ups and part payments coexist with compounding.

Five methods, unchanged from the prototype's menu:

| Method | Behaviour |
|---|---|
| Daily pro-rata simple | exact days ÷ 30 × monthly rate |
| Monthly simple | part months billed as whole months |
| Monthly / Quarterly / Annual compound | unpaid interest folded into the principal each cycle |

**The automatic 2-year switch** you asked for: a simple-interest pledge still
open after 24 months is **recalculated as compound interest from day one**.
The moment it crosses the threshold, the whole history is replayed with
compounding cycles running from the pledge date — not merely from the
anniversary onwards.

In practice, on ₹1,00,000 at 2%/month with annual compounding:

| As of | Amount owed | Why |
|---|---|---|
| 1 day before 24 months | ₹1,48,733 | still plain simple interest |
| exactly 24 months | ₹1,53,843 | crosses over — now P×1.24², charged from the start |
| 36 months | ₹1,90,765 | P×1.24³ |

The step-up on the crossing day is the point of the rule, so the app says so
plainly: the pledge screen names the conversion date, states that the entire
loan has been repriced from the pledge date, and shows exactly how much more
that is than simple interest. Before the threshold, the screen warns that the
amount **will** step up on that date, with the "Never" override one tap away.

Controls:
- shop-wide, in `Settings → Interest rules`: on/off, the threshold in months
  (default 24), and the cycle after conversion (monthly / quarterly / yearly);
- per pledge, in `Pledge → Compounding rule`: **Shop default / Always on /
  Never** — the manual override, changeable at any time;
- the same choice is offered while creating a pledge.

**The pledge day itself is billable.** The clock starts one day before the
pledge date, so a loan checked (or even settled) on the very day it is
disbursed already owes a day's interest — it never shows ₹0 just because no
full day has technically elapsed yet. That extra day is added once, at the
very start of the loan's life, not at every top-up or payment.

Verified against hand-worked figures:

| Case | Engine | Expected |
|---|---|---|
| ₹1L, 2%/mo, 366-day span (+1 for the pledge day itself), simple | ₹24,467 interest | 100000 × .02 × 367/30 |
| ₹1L, 2%/mo, monthly compound, 12 months | ₹1,26,907 | P(1.02)¹² + the first cycle's extra day, compounded |
| quarterly compound, 12 months | ₹1,26,327 | P(1.06)⁴ + the first cycle's extra day, compounded |
| 3 years, auto-convert at 2 years, annual | ₹1,90,765 | P(1.24)³ — repriced from day one |
| same, quarterly cycle | ₹2,01,346 | P(1.06)¹² |
| same, monthly cycle | ₹2,04,122 | P(1.02)³⁶ |
| same loan, override = Never | ₹1,73,133 | pure simple throughout, 1097 billable days |
| ₹1L + ₹50k top-up at 6 months | ₹30,600 interest | two segments, hand-checked |
| converted loan + ₹50k top-up at 12 months | ₹2,67,645 | (P×1.24 + 50k)×1.24², plus the compounded first day |
| interest cleared monthly, simple, 3 years | ₹0 capitalised | nothing left to capitalise, whatever the exact total |

### Error handling (new)

Nothing in the app fails silently, and no raw database text ever reaches the
shopkeeper.

- **One translator.** `src/lib/errors.ts` classifies anything thrown — Postgres
  codes (`23505` duplicate, `23503` in-use, `42501` RLS, `23514` bad value),
  PostgREST codes, Supabase auth messages, storage limits, timeouts — into a
  kind, a title, a plain-English sentence, and whether retrying is worth it.
  A receipt-number collision becomes "That receipt number was just used on
  another device. Try saving again", not `duplicate key value violates unique
  constraint`.
- **Crash boundary.** A render bug shows a recoverable screen with a "Try
  again" button, not a white screen. It reassures the user their data is safe
  on the server.
- **Offline strip.** The app watches connectivity and shows a bar under the app
  bar when the network is down or connected-but-unreachable. Save buttons
  disable while offline rather than failing after the fact, and a failed load
  retries itself automatically when the connection returns.
- **Retry, not dead ends.** A failed load shows a full-panel error with a Retry
  button; if data was already on screen it stays there, flagged as possibly
  stale, instead of blanking out.
- **Double-submit guard.** `useAsyncAction` blocks re-entry, so double-tapping
  "Save receipt" cannot create two receipts.
- **Session expiry** signs the user out cleanly with an explanation instead of
  looping on failed requests.
- **Field validation** happens before the network call: amounts against the
  outstanding balance, net weight against gross, dates against the pledge date
  and today, 6-digit pincodes, 12-digit Aadhaar, PAN format, weak-PIN rejection.
- **20-second request timeout**, so a hung socket on patchy shop wifi surfaces
  as a normal retryable error.
- **Failures are scoped.** A receipt that prints badly no longer looks like a
  failed payment; a photo that will not upload does not block recording the
  pledge.

### Photo compression (new)

Phone cameras produce 3–8 MB JPEGs. Before anything is uploaded,
`src/lib/images.ts` resizes it — 1280px for ornaments, 1600px for KYC documents
so the text stays readable — and re-encodes at 60% quality. That is typically
**150–250 KB instead of 3–8 MB**, a 20–40× saving, and it is the resize rather
than the quality setting that does the work.

The toast confirms the stored size ("Photo attached (182 KB)"). If the image
library chokes on an unusual format, the upload falls back to the original file
rather than losing the photo. At these sizes the 1 GB free bucket holds several
thousand photos.

### Everything the prototype already did, ported
Dashboard with money-on-the-street and metal-held totals · pledge list with
search and filters · pledge detail with a day-by-day ledger · customer KYC with
photos · payment collection (interest / principal / combined / full settlement,
with waivers) · receipts and pledge agreements as printable PDFs · reports with
PDF export · the six accent themes (Imperial Gold is still the default) ·
WhatsApp and call reminders straight from a pledge.

Photos now upload to Supabase Storage under `<store_id>/…` and are served
through short-lived signed URLs, instead of base64 inside the database.

---

## 5. Project layout

```
src/
  lib/supabase.ts          Supabase client, 20s request timeout
  lib/errors.ts            every error -> title, plain sentence, retryable?
  lib/images.ts            resize + compress photos before upload
  lib/security.ts          biometrics, PIN hashing, auto-lock preferences
  hooks/useAsyncAction.ts  busy state, double-submit guard, error capture
  context/AuthContext      session, memberships, store create/join, lock state
  context/DataContext      per-shop data, realtime sync, compounding policy
  context/NetworkContext   connectivity + the offline strip
  components/ErrorBoundary crash screen with recovery
  components/Toast         success / error snackbars with Retry
  components/ui.tsx        shared UI kit (ErrorBanner, ErrorState, …)
  services/api.ts          every database call
  services/mappers.ts      snake_case <-> camelCase
  services/receipts.ts     pledge agreement / receipt / voucher HTML -> PDF
  utils/interest.ts        the interest engine
  utils/dates.ts           timezone-safe calendar maths
  theme/                   ported palette and the six accents
  screens/                 all screens, auth screens under screens/auth
supabase/schema.sql        tables, RLS, RPCs, storage bucket (as applied live)
```

## 6. Checks

```bash
npm run typecheck
```

```bash
npx expo export --platform android
```

Both pass: `tsc --noEmit` is clean, and Metro bundles all 1,387 modules without
an error. The interest engine was additionally verified against hand-worked
figures (the table in §4), and RLS was verified against the live database with
two real users (the table in §2).

## 7. Worth knowing

- **Document numbers** (loan, receipt, top-up voucher) are minted by a Postgres
  function, so two phones in the same shop can never mint the same number.
- **Realtime**: a change on one phone refreshes the other within a second.
- **Cloud-only by design.** There is no local database. Every phone reads and
  writes the same server rows, so two staff members can never drift out of
  sync or overwrite each other's work with stale local copies — which is the
  whole point of putting the shop on Supabase. The trade-off is that the app
  needs a connection to save; it says so clearly with the offline strip and
  disabled save buttons rather than accepting an entry it cannot keep.
- **Deleting** loans and customers is restricted to OWNER/MANAGER by RLS.
- **`store_code`** lets anyone holding it join the shop. Share it deliberately;
  rotating it means issuing a new code in the `stores` row.
- **App icon** (`asset/icon.png`, `asset/adaptive-icon.png`) is the "Heritage
  Arch" mark from the `Girvi Vault Logo` design canvas, regenerated locally:
  the "GV" monogram is real Cinzel-font vector outlines (baked in with
  `opentype.js`, since the SVG renderer used to rasterize these has no access
  to embedded web fonts and would otherwise silently fall back to a generic
  sans-serif), and the adaptive-icon foreground drops the canvas's own solid
  purple background layer and insets the rest by 20% per the canvas's own
  spec, pairing with `android.adaptiveIcon.backgroundColor` (`#2A0E44`)
  instead — so the mark isn't double-drawn under an Android launcher's mask.
  Regenerating either file means re-running that same pipeline, not just
  re-exporting the canvas at a different size.
#   g i r v i - m o b i l e  
 