# PrisonConnect Backend — Real (not mock)

## Setup
```bash
npm install
cp .env.example .env    # set JWT_SECRET at minimum
npm start                # or: node server.js
```

Drop your real `auth-routes.js` and `admin-routes.js` back in — the ones
included here are placeholders (yours weren't part of the uploaded
`server.js`, so this couldn't include them).

## Architecture

Calls are **pure 1-to-1 P2P WebRTC**. The backend holds no media stack at all:

- **Signaling** lives in the dedicated `signaling-server` (Socket.IO only):
  SDP offer/answer exchange, ICE candidate exchange, room/call state.
  The backend talks to it over HTTP for room control (`/api/rooms/:id/close`,
  `/api/rooms/:id/control`).
- **Media** flows directly between the Android kiosk and the family browser
  via `RTCPeerConnection`. coturn (TURN) is only an ICE connectivity fallback.
- **Recording** is done on the kiosk side. After a call ends the kiosk uploads
  the file via `POST /recordings/upload` (base64 JSON body), the backend
  verifies + stores it under `/recordings` and marks the call's
  `recordingStatus = 'completed'`. The kiosk deletes its local copy only
  after a verified upload.

## What's actually real now
- **Auth** — JWT access/refresh tokens (`jsonwebtoken`), PINs checked with
  `bcrypt.compare` (falls back to plaintext comparison only for
  not-yet-migrated records). Wrong PIN/kiosk now returns 401 instead of
  silently logging in. All state-changing and PII-exposing routes require
  `Authorization: Bearer <token>`; role checks via `requireRole(...)`.
- **Room-bound signaling tokens** — every `POST /calls` response carries a
  short-lived JWT (`signalingToken`) bound to that call's room so the kiosk's
  signaling socket can only join its own room.
- **Business rules** — call creation validates that the inmate, contact and
  kiosk exist and that the contact is approved for that inmate; blocks a
  second active call for the same inmate; call status changes go through a
  state machine (`ALLOWED_TRANSITIONS`) instead of accepting any string.
- **Active-call tracking** — `GET /calls/active` plus recording status/duration
  metadata power the warden dashboard.
- **Concurrency-safe DB** — `lib/db.js` serializes reads/writes per file and
  writes atomically (write-temp-then-rename), fixing the lost-update race
  from concurrent requests.

## Honest limitations — what you still need before production
- **Face/fingerprint matching**: `/auth/face-identify` and
  `/auth/fingerprint-identify` now check the kiosk assignment correctly but
  do **not** compare biometric templates — that needs a real matcher
  (e.g. a face-embedding service) wired into `identifyInmate()` in
  `server.js`.
- **NAT traversal**: clients behind symmetric NAT need the TURN server
  reachable (see `coturn/turnserver.conf`); STUN-only networks will fail to
  connect without it.
- **JSON-file storage**: fine for a pilot; for real concurrent load move
  `lib/db.js`'s interface to Postgres/Mongo — the read/update function
  signatures were kept storage-agnostic on purpose.
- `auth-routes.js` / `admin-routes.js` here are placeholders — your
  originals need to be merged back in.
