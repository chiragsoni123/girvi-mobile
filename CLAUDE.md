# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Girvi Pawn Manager — a React Native (Expo, SDK 54) Android app for pawn shops, backed by Supabase
(Postgres + Auth + Storage + Realtime). Multi-user, multi-shop: every table is isolated per shop via
Postgres row-level security, not app-level checks. There is no local database — every screen reads
and writes the same server rows, so two staff members on different phones never drift out of sync.

## Commands

```bash
npm install              # install deps
npx expo run:android     # development build — installs on a connected device or emulator; the normal way to run this app now
npx expo start -c        # Metro only, clearing the cache (needed after editing .env); pair with a dev client, NOT plain Expo Go (see caveat below)
npm run typecheck        # tsc --noEmit — run this after any change, it's the only automated check
npx expo export --platform android   # sanity-checks that Metro can bundle every module
eas build -p android --profile preview     # cloud APK build via EAS (npm run build:apk)
eas build -p android --profile production  # cloud .aab build for Play Store (npm run build:play)
```

There is no test suite and no lint script configured — `npm run typecheck` is the only checable
gate before calling a change done. There's also no CI config in this repo.

**Plain Expo Go no longer works.** `lottie-react-native` (the loading-screen animation) ships
native code that isn't in Expo Go's bundled module set, so `npx expo start` + scanning the QR code
in the Expo Go app will fail to load. Use `npx expo run:android` (dev build) or an EAS dev client.
Every other dependency here is still Expo-Go-compatible, so this is worth re-checking if
`lottie-react-native` is ever removed.

### Environment setup

Copy `.env.example` to `.env` and fill in `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`
from the Supabase dashboard. Both are safe to ship in the app — the anon/publishable key only works
through RLS. Never put the `service_role` key here. If `.env` is missing/placeholder,
`isSupabaseConfigured` (`src/lib/supabase.ts`) goes false and `RootNavigator` shows a setup screen
instead of the app.

Windows-specific: don't put this project in a folder path containing `&` — `cmd.exe`'s `.bin` shims
break. If you must, invoke the Expo CLI via a relative path (`node ".\node_modules\expo\bin\cli" start`).

**Auth redirect URLs are a manual dashboard step, not a code setting.** Both `girvi://reset-password`
and `girvi://confirm-email` must be added under Supabase's Authentication → URL Configuration →
Redirect URLs. A `redirectTo`/`emailRedirectTo` that isn't allow-listed there silently falls back to
the project's Site URL (often still `localhost`) — no error, the link just opens somewhere that
isn't the phone. See `RootNavigator`'s deep-link handling below.

## Architecture

### Data flow: schema.sql → services/api.ts → mappers → contexts → screens

- `supabase/schema.sql` is the single source of truth for the backend, applied by hand via the
  Supabase SQL editor (there's no migration tool). It defines 7 tables (`stores`, `store_members`,
  `customers`, `loans`, `loan_items`, `loan_topups`, `payments`), RLS policies driven by
  `private.is_store_member(store_id)` / `private.is_store_owner(store_id)`, three RPCs
  (`create_store`, `join_store`, `next_document_no`), `touch_updated_at` triggers, and the
  `girvi-photos` storage bucket + its policies. Whenever backend behavior seems wrong, check this
  file before assuming the client is at fault.
- `src/services/api.ts` is the only place that calls `supabase.from(...)` / RPCs — screens never
  touch the client directly for data. `src/services/mappers.ts` is the only place that converts
  between Postgres `snake_case` rows and the app's `camelCase` domain types (`src/types/girvi.ts`).
  Keep that boundary: new columns get a mapper entry, not ad-hoc `row.some_field` in a screen.
- Two contexts hold all shared state, layered in `App.tsx`:
  - `AuthContext` — session, shop memberships, active shop, biometric lock state, and the
    create-shop/join-shop flow. Notably: sign-up with email confirmation ON returns no session, so
    the "create or join shop" intent is parked in AsyncStorage (`PendingStoreIntent`) and replayed
    on first real sign-in (`applyPendingIntent`).
  - `DataContext` (mounted only once a shop is selected) — loads customers/loans/payments for the
    active shop, subscribes to Postgres realtime changes on all 5 shop-scoped tables so a second
    phone's edits show up within a second, and exposes lookup helpers (`customerById`, `loanById`,
    etc.) so screens don't re-filter arrays themselves.
  - Both track loading/refreshing/error/isStale independently so a failed refresh never blanks out
    data already on screen — see "Error handling" below.
- `src/navigation/RootNavigator.tsx` is the top-level state machine: unconfigured Supabase → setup
  screen; initializing → splash; no session → auth stack; session but no shop → `StoreGateScreen`;
  session + shop → `DataProvider` wrapping either `LockScreen` (biometric lock active) or the main
  tab/stack navigator. It also owns the *entire* deep-link/auth-completion path: `lib/supabase.ts`
  turns off `detectSessionInUrl` (no URL bar in RN to consume it), so `RootNavigator` reads the
  cold-start URL (`Linking.getInitialURL()`) and the warm-start one (`Linking.addEventListener`),
  pulls a `code` param out of it, and calls `supabase.auth.exchangeCodeForSession(code)` itself —
  that call fires `PASSWORD_RECOVERY` (flips `recoveryMode`, swaps in `ResetPasswordScreen`) or
  `SIGNED_IN` (falls through to the normal `bootstrapSession`/`applyPendingIntent` flow) depending
  on which flow originally issued the code. Both `girvi://reset-password` and `girvi://confirm-email`
  need to be on Supabase's Redirect URLs allow-list for this to ever run — see Environment setup.

### Interest engine (`src/utils/interest.ts`)

The core domain logic. A loan is replayed as a timeline of events (disbursal, top-ups, payments,
capitalization cycles) rather than computed with a single formula — that's what lets top-ups and
part-payments coexist with compounding. Five interest methods (daily pro-rata simple, monthly
simple, monthly/quarterly/annual compound), plus an automatic simple→compound conversion: a
simple-interest loan still open after `afterMonths` (shop setting, default 24) is recalculated as
compound **from day one**, not just from the crossing date — replaying the whole history with
capitalization cycles from the loan date. This is shop-wide policy (`Settings → Interest rules`)
with a per-loan override (`Never` / `Always` / `Shop default`). The pledge day itself is billable —
`runTimeline`'s accrual clock starts one day before `loan.loanDate`, so a loan checked (or settled)
the same day it's disbursed already owes a day's interest instead of showing ₹0; that extra day is
added once, at the start of the loan's life, never per top-up. If you touch this file, sanity-check
against the hand-worked figures table in [README.md](README.md#4-what-was-added-on-top-of-the-prototype)
before trusting a change — regenerate those numbers by constructing the same `GirviLoan`/payments/
top-ups shapes and calling `calculateLoan` directly (e.g. via `npx tsx`) rather than hand-deriving
them, since compounding cycles amplify small day-count changes non-obviously.

### Error handling (`src/lib/errors.ts`)

One function, `toAppError`, classifies every thrown value (Postgres error codes, PostgREST codes,
Supabase auth message strings, storage errors, network/timeout errors) into a `kind`, a title, a
plain-English `message`, and `retryable`/`requiresSignIn` flags. Nothing else in the app should
pattern-match on raw error text or Postgres codes — route new error cases through this file so the
mapping stays in one place. `requiresSignIn: true` errors are handled globally by
`AuthContext.handleSessionExpiry`, not shown as a normal screen error.

Related conventions to follow when adding a mutation:
- Wrap the async call with `useAsyncAction` (`src/hooks/useAsyncAction.ts`) to get a busy flag and a
  double-submit guard for free.
- Requests already time out at 20s via `fetchWithTimeout` in `src/lib/supabase.ts` — don't add
  another timeout layer.
- A failed load should keep existing data on screen (flagged stale) rather than clearing it; see how
  `DataContext.load` handles `mode` (`initial` / `refresh` / `silent`).

### Photos (`src/lib/images.ts`)

Camera photos are resized (1280px ornaments / 1600px KYC docs) and re-encoded before upload —
never upload a raw camera file. Photos live in the `girvi-photos` Storage bucket under
`<store_id>/…` and are served via short-lived signed URLs, never public URLs.

### Security (`src/lib/security.ts`)

Biometric app-lock is device-local and independent of the Supabase session — it never blocks a
legitimate sign-in, and losing the phone doesn't expose the ledger. Backup PIN is hashed with a
random salt stored in the device keystore (`expo-secure-store`), not sent to the server.

### Boot splash (`src/components/BootSplash.tsx`)

Shown once per cold start, entirely in JS — not the native Android/iOS splash config in
`app.json`. `App.tsx` calls `SplashScreen.preventAutoHideAsync()` at module scope so the native
(plain background-colour) splash stays up until `BootSplash` mounts and calls `hideAsync()`,
avoiding a blank frame between the two. `BootSplash` then holds its full-screen image for a fixed
duration, fades out, and calls `onFinish` to unmount itself. Deliberately avoids touching
`android/`'s native drawable/styles.xml splash config, so it needs no `expo prebuild` step and
works the same in a dev client or an EAS build.

### Project layout

```
src/
  lib/supabase.ts          Supabase client, 20s request timeout, isSupabaseConfigured gate
  lib/errors.ts             every error -> title, plain sentence, retryable? (see above)
  lib/images.ts             resize + compress photos before upload
  lib/security.ts           biometrics, PIN hashing, auto-lock preferences
  hooks/useAsyncAction.ts   busy state, double-submit guard, error capture
  context/AuthContext       session, memberships, store create/join, lock state
  context/DataContext       per-shop data, realtime sync, compounding policy
  context/NetworkContext    connectivity + the offline strip
  components/ErrorBoundary  crash screen with recovery
  components/Toast          success / error snackbars with Retry
  components/BootSplash.tsx one-time boot image (see above)
  components/ui.tsx         shared UI kit (ErrorBanner, ErrorState, Loading w/ Lottie, …)
  services/api.ts           every database call — the only place touching supabase.from()/rpc()
  services/mappers.ts       snake_case <-> camelCase — the only place touching raw row fields
  services/receipts.ts      pledge agreement / receipt / voucher HTML -> PDF
  utils/interest.ts         the interest engine (see above)
  utils/dates.ts            timezone-safe calendar maths
  theme/                    palette and the six accent themes (shop-selectable)
  screens/                  all screens, auth screens under screens/auth
supabase/schema.sql          tables, RLS, RPCs, storage bucket — apply by hand via SQL editor
asset/                        Lottie loading animation, the boot-splash image, and the app icon
                               pair (note: singular "asset", not Expo's usual "assets" — required
                               by BootSplash/ui.tsx/app.json)
```

## Things worth knowing before changing behavior

- **Document numbers** (loan/receipt/top-up voucher) are minted by the `next_document_no` Postgres
  function so two phones in the same shop can never mint the same number — don't generate these
  client-side.
- **Deleting** loans/customers is restricted to OWNER/MANAGER by RLS policy, not just UI hiding.
- **`store_code`** is a 6-character join code; anyone holding it can join the shop as STAFF via
  `join_store`. There's no way to rotate it except issuing a new one directly in the `stores` row.
- Cloud-only by design — don't add local persistence/caching of shop data (AsyncStorage here is only
  used for auth/session bookkeeping, e.g. `ACTIVE_STORE_KEY`, `PENDING_INTENT_KEY`).
- **The app icon's "GV" monogram is baked-in vector outlines, not live text.** `asset/icon.png` /
  `asset/adaptive-icon.png` were rasterized from the `Girvi Vault Logo` design canvas via `sharp`;
  the SVG renderer sharp uses has no access to embedded/data-URI web fonts, so the Cinzel glyphs
  were pre-outlined with `opentype.js` before rasterizing — regenerating these assets means redoing
  that outlining step, not just re-exporting the canvas SVG directly. `android/` is regenerated from
  `app.json`'s `icon`/`adaptiveIcon` fields via `expo prebuild --platform android --clean`, which
  wipes any hand-edited native Android code — this repo has none today, but check before re-running
  it. There's no git in this repo, so back up `android/` first if you do.
