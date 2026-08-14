# PrisonConnect — Fix Plan

Ordered by priority per the audit. Every item lists: problem · project · file/location · severity ·
why it matters · recommendation · blockers.

---

## 1. Critical security problems

### F1 — Unauthenticated /admin router (admin CRUD + biometrics)
- **Project:** backend
- **Location:** `backend/server.js:71–72`, `backend/admin-routes.js`
- **Severity:** CRITICAL
- **Why:** Anyone can list/create/modify/delete admins and register prisoner biometrics with no token. Verified live (GET 200, POST 201).
- **Fix:** Mount under auth: `app.use('/admin', requireAuth, requireRole('admin','super-admin'), adminRouter)`; add same guard inside router for safety. Stop returning `password`/`pin` from the list route; return `{password,pin,...omit}` everywhere.
- **Blockers:** none.

### F2 — Plaintext credentials everywhere + cleartext `/auth/register`
- **Project:** backend
- **Location:** `backend/db/{wardens,users,inmates,prisons}.json`, `backend/server.js:553`
- **Severity:** CRITICAL
- **Why:** All credentials are public/known values; a single leaked file compromises every account. `/auth/register` writes plaintext warden passwords (verified login with plaintext).
- **Fix:** `hashSecret()` on every create/update path (register, warden creation, prison setup PIN → hash or store outside app); delete committed seed credentials and reseed with bcrypt hashes; add a migration script (`backend/scripts/hash-credentials.js`) that hashes all `password`/`pin`/`setupPin` fields.
- **Blockers:** coordination with kiosk/warden teams on credential uniqueness; bcryptjs already available.

### F3 — IDOR / missing authorization on `/inmates`, `/wallets`, `/contacts`, `/rooms`, `/transactions/wallet/:id`, `/alerts`
- **Project:** backend
- **Location:** `backend/server.js:887,1067,1078,1378,1826,1479`
- **Severity:** CRITICAL
- **Why:** Any kiosk/inmate JWT reads every inmate wallet/contact. Verified 200.
- **Fix:** Role-gate to wardens/admins for full collections; add per-inmate scoping based on `req.auth` identity (inmate sees own wallet; kiosk sees assigned inmates only). Add `requireRole` or explicit ownership checks per route.
- **Blockers:** none.

### F4 — Privilege escalation: kiosk PATCH /settings + kiosk self-approval + setup-PIN disclosure
- **Project:** backend
- **Location:** `backend/server.js:1554,1888,1906,1969`
- **Severity:** CRITICAL
- **Why:** Kiosk token can overwrite global settings (verified 200), approve its own registration, and read any prison setup PIN (verified value returned).
- **Fix:** `PATCH /settings` → `requireRole('admin','warden')`; kiosk approve/reject → `requireRole('admin','super-admin')` with log/audit; setup-PIN GET → admin-only and return a masked value.
- **Blockers:** none.

### F5 — Socket/realtime authorization alignment (family-web passes roomId as JWT)
- **Project:** family-web + backend
- **Location:** `family-web/src/services/socket.ts:33`
- **Severity:** HIGH (mitigated today because backend rejects it)
- **Why:** If the backend ever weakens token parsing, room IDs become valid creds (impersonation).
- **Fix:** Issue a real per-session JWT after OTP verification; family client must persist it and pass it in `auth.token`. Never accept bare room IDs.
- **Blockers:** requires F-family verification endpoints (F11).

## 2. Data integrity problems

### F6 — Seed referential integrity broken (contacts/rooms → INM-001 vs inmates 100101)
- **Project:** backend data
- **Location:** `backend/db/{contacts,rooms,inmates}.json`
- **Severity:** HIGH (data) / CRITICAL (call creation)
- **Why:** Call creation fails `UNAUTHORIZED_CONTACT` on all seed data (verified 403); monitoring joins never match.
- **Fix:** Rewrite seeds so `contacts.inmateId`, `rooms.inmateId/inmateId` reference real `inmates.inmateId` (`100101`…). Normalize `approvedContactIds` usage. Add a seed-validation script + CI check.
- **Blockers:** none.

### F7 — Call collection has two schemas +
- **Project:** backend / warden-dashboard
- **Location:** `backend/db/calls.json`, `backend/server.js:1265–1278`, `warden-dashboard/src/services/api/wardenApi.ts:4–25`
- **Severity:** HIGH
- **Why:** Flat vs nested fields make warden monitoring render NaN/undefined; wallet lookup TypeErrors.
- **Fix:** Pick one canonical schema (`durationMinutes`, `recordingEnabled`, `recordingStatus`, `connectionQuality`, …) for both seed and POST /calls; add `server.js` normalization layer; update warden types.
- **Blockers:** none.

### F8 — Settings schema mismatch (warden page wipes server settings)
- **Project:** warden-dashboard + backend
- **Location:** `warden-dashboard/src/services/api/wardenApi.ts:157–174`, `backend/db/settings.json`
- **Severity:** HIGH
- **Why:** Save overwrites real config with near-empty objects.
- **Fix:** Align the `Settings` type to `backend/db/settings.json` keys (`callSettings.{maxCallDurationMinutes,autoEndCallMinutes,enableRecording,recordingQuality,encryptionRequired}` etc.); prefill from GET before editing; remove hardcoded `PRISON-001`/`123456` (`SettingsPage.tsx:148,157`).
- **Blockers:** none.

## 3. Core functionality failures

### F9 — Mediasoup disabled + two ReferenceError 500s
- **Project:** backend
- **Location:** `backend/server.js:13–17,122–126,190,216,235,268,282,329–334,1747,1634`
- **Severity:** CRITICAL (media = product) + HIGH (500s)
- **Why:** No calls possible; `/calls/:id/control` and `/recordings/:id/stop` always 500.
- **Fix:** (a) Conditionally init workers when `MEDIASOUP_WORKERS≥1` (or re-enable with env flag) and restore handlers; fix `MEDIASOUP_ANNOUNCED_IP` to the real public IP. (b) Guard `mediasoupManager`/`outputPaths` with null-checks so control/stop return useful errors until media is enabled.
- **Blockers:** deployment host with open UDP range (40000–49999); production announced IP or TURN; ffmpeg on host for recording.

### F10 — vendor-dashboard login cannot ever work
- **Project:** vendor-dashboard + backend
- **Location:** `vendor-dashboard/src/services/auth/authApi.ts:24`, `backend/server.js:490`
- **Severity:** CRITICAL (feature) / HIGH (security posture)
- **Why:** `POST /auth/login` expects kioskId+pin; returns no `user`. Verified 400/no-user.
- **Fix:** Add a vendor role + `POST /auth/vendor/login` (email+password) returning `{user}`; route client to it; backend seed vendor account.
- **Blockers:** none.

### F11 — family-web verification endpoints + auth contract
- **Project:** backend + family-web
- **Location:** `backend/server.js` (missing routes), `family-web/src/services/api.ts`
- **Severity:** HIGH
- **Why:** `/calls/link/:token`, `/device-verification`, `/otp-verification`, `/rooms/leave` 404 (verified); no Authorization header (verified).
- **Fix:** Implement link/device/OTP endpoints (token → call session, OTP delivers session JWT); family client: attach bearer token, persist session (sessionStorage) so Lobby→Call survives navigation, fix `join-room` ack/`joined` event handling.
- **Blockers:** none.

## 4. Cross-project integration failures

### F12 — `/auth/refresh` shape mismatch (warden & vendor)
- **Project:** backend, warden-dashboard, vendor-dashboard
- **Location:** `backend/auth-routes.js:17–22`, `warden-dashboard/src/services/api/client.ts:82`, `backend/lib/auth.js`
- **Severity:** HIGH
- **Why:** Forced auto-logout ~50 min after login; `persistAuth(tokens,{})` clobbers user.
- **Fix:** Return the standard `{success, data:{accessToken,refreshToken,expiresIn,user}}` envelope from `/auth/refresh`; update client to not overwrite the stored user.
- **Blockers:** none.

### F13 — Socket broadcast vs warden listeners mismatch
- **Project:** warden-dashboard, backend
- **Location:** `warden-dashboard/src/services/socket/useWardenSocket.ts`, `backend/server.js`
- **Severity:** MEDIUM
- **Why:** `peer-joined`/`new-producer` are disabled server-side; `call-control`/`room-created` never listened; `sendEvent` uses `socket.send()` (engine) instead of `emit`.
- **Fix:** Attach token to warden socket, subscribe to the events the server actually emits, fix `sendEvent` to `emit`, and de-bounce re-connect on every render.
- **Blockers:** F13a react reconnect bug → fix effect deps.

### F14 — vendor data schema/ID mismatches (crashes)
- **Project:** vendor-dashboard, backend
- **Location:** `vendor-dashboard/src/services/api/vendorApi.ts`, `backend/db/{prisons,servers,pricing,storage,reports}.json`
- **Severity:** HIGH
- **Why:** Dashboard/Pricing crash on real data; fields mismatch everywhere.
- **Fix:** Map backend keys (prisonId, status:'active', capacity, kioskIds → totalKiosks etc.) in `vendorApi`; guard `.toFixed`/`.toLocaleString`.
- **Blockers:** none.

## 5. High-severity reliability problems

- **F15** family `endCall` in unmount + StrictMode double-fire → guard idempotency (`family-web/src/pages/CallPage.tsx:41–45`).
- **F16** family remote-end doesn't tear down socket/transports (`CallPage.tsx:114–119,202–205`).
- **F17** family remote **audio dropped** (`webrtc.ts:187–194`) → add `audioConsumer.track` to the same MediaStream.
- **F18** warden monitor simulates stats every 2 s PATCHing fake data (`MonitorScreenPage.tsx:183–221`) → gate behind real media or stop writing.
- **F19** Android: `createRoom`/slot-check/recording/receipt mocked; lock-task disabled; body-log everything incl. release.
- **F20** Add error boundaries + safe fallbacks (no `inmates[0]` silent fallback, `CallHistoryPage` ignores param).

## 6. Automated testing gaps

- **F21** Backend: promote `backend/audit-tests.mjs` to a runnable `npm test` (node:test or vitest) wired into CI; add tests for authz matrix, wallet scoping, call lifecycle, settings guard, kiosk approve role gate.
- **F22** family-web: build the missing backend endpoints first, then add React/Vitest tests for session persistence, join race, and REST auth header.
- **F23** warden/vendor: add vitest + MSW tests for API contract mapping; snapshot the page renders.
- **F24** android: add JUnit + Robolectric & instrumented tests for LoginViewModel, RegistrationViewModel, WebRtcManager state machine, DataStore session TTL.
- **F25** Add a contract test comparing `server.js` routes + db shapes against a shared `types/` package consumed by all 4 clients.

## 7. Performance problems

- **F26** DB: keep per-file queue; add read-through index (Map) per collection; cap request fan-out; later move to Postgres (keep `readDb/updateDb` signature).
- **F27** warden socket: stop reconnecting per render; server-side throttling for `statistics-updated`.
- **F28** family bundle 572 kB → code-split routes, drop unused mediasoup polyfills.

## 8. Medium issues

- **F29** CORS tighten (`CORS_ORIGIN` list), add `helmet`, CSP, HSTS.
- **F30** `/auth/refresh` rate-limited; logout server-side revocation store (DB-backed blacklist).
- **F31** Forgot/reset-password: wire real email service or remove the mock reset-token display.
- **F32** Face liveness: reject `liveness===0` cases; require a challenge.
- **F33** Android: R8/ProGuard + per-buildType logging gate; remove `READ_PHONE_STATE`/`MANAGE_DEVICE_ADMIN` unless justified; use `AutoMirrored` icons.
- **F34** Fix eslint configs (wards/family: add rules; vendor: create config + install eslint).
- **F35** Remove dead code: `callApi.leaveRoom`, `env.webrtcIceServers`, `sendEvent`, `DeviceModel.kt`, `.gitkeep` shells, `VITE_MEDIASOUP_MONITOR_URL`, `public/`,`-p/` dirs.

## 9. Low-priority cleanup

- **F36** Add `/favicon.svg` or remove reference; add `.npmrc`/lockfile for family-web reproducibility.
- **F37** Remove hardcoded dust: startup log URL, `version:'2.0.0-real'`, `officerName:'warden-001'`.
- **F38** Standardize Prettier across vendor-dashboard.

---

## Suggested execution order (batched)

1. **Week 1 (security triage):** F1, F2, F3, F4, F6, F12, F10 — all backend, all verifiable by the audit suite.
2. **Week 2 (core media):** F9, F11, F16, F17, F18.
3. **Week 3 (integration):** F7, F8, F13, F14, F15.
4. **Week 4 (hardening):** F5, F19, F20, F29–F34.
5. **Continuous:** F21–F25 tests on every PR; F26–F28 perf; F35–F38 cleanup.

Re-run `node backend/audit-tests.mjs` after each batch; target 0 FAIL on the security/control tests before any deployment.