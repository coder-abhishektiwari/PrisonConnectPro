# PrisonConnect — Prison Video Calling & Monitoring System

Centralized, secure video and audio communication platform designed for inmate-to-family calls managed and monitored by Jail Administration.

## System Architecture Overview

PrisonConnect provides a multi-tenant, secure ecosystem consisting of:

- **`android-kiosk/`**: Native Android Application (Kotlin) running on hardware kiosks for inmate multi-modal authentication (RFID, Fingerprint, Prisoner ID), call scheduling, balance checks, WebRTC audio/video streams, live billing, and receipt printing.
- **`family-web/`**: Browser-based React + TypeScript web client requiring zero application download for verified family members joining scheduled encrypted calls.
- **`warden-dashboard/`**: React + TypeScript administration portal for silent live call monitoring, call control (mute/disconnect), inmate profile management, prisoner trust account management, recording center, kiosk health monitoring, and SaaS multi-jail management.
- **`backend/`**: Node.js/Express API + Socket.IO gateway. PostgreSQL persistence (migrations in `db-schema/`, self-seeding from `legacy-db/`), wallet/billing ledger, call records, and SMS/OTP dispatch.
- **`signaling-server/`**: Node.js Socket.IO hub that relays WebRTC offer/answer/ICE between the kiosk and the family browser. Pure P2P — no media passes through it.
- **`docs/`**: Complete architectural diagrams, infrastructure design, security policies, and technical specifications.

## Repository Structure

```text
PrisonConnect/
 ├── android-kiosk/         # Kotlin Kiosk Client
 ├── family-web/            # React + Vite Family Web Portal
 ├── warden-dashboard/      # React + Vite Warden & SaaS Admin Console
 ├── vendor-dashboard/      # React + Vite Vendor Console
 ├── backend/               # Node.js/Express API + Socket.IO gateway (PostgreSQL)
 ├── signaling-server/      # Node.js WebRTC signaling hub (Socket.IO)
 ├── coturn/                # TURN relay configuration
 └── docs/                  # Architecture & System Documentation
```

## Setup & Environment Configuration

Every Node app reads a local `.env`. Each component ships a **secret-free**
`.env.example` template (variable names and placeholders only — the real `.env`
is gitignored and must never be committed).

```bash
git clone <repo> && cd PrisonConnect
npm install                                   # installs all four workspaces at once

cp backend/.env.example            backend/.env
cp signaling-server/.env.example   signaling-server/.env
cp family-web/.env.example         family-web/.env
cp warden-dashboard/.env.example   warden-dashboard/.env
cp android-kiosk/local.properties.example android-kiosk/local.properties
```

### Environment variables

The full annotated list lives in each `.env.example`. Only two are hard
requirements, both in `backend/.env`:

| Variable       | Where                                                        | What happens if missing                                                                                  |
| -------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `JWT_SECRET`   | `backend/.env`, `signaling-server/.env` (same value in both) | Server **refuses to start**. Tokens are signed with it, so rotating it invalidates every issued session. |
| `DATABASE_URL` | `backend/.env`                                               | Backend boots but runs **empty** — every read returns `[]` and auto-seed is skipped.                     |

Everything else has a working default: SMS falls back to `SMS_PROVIDER=log`
(writes to console + `backend/logs/`, costs nothing), `SIGNALING_URL` and
`FAMILY_WEB_URL` default to localhost, and the kiosk reads
`android-kiosk/local.properties`.

### Run it

```bash
npm run backend        # API           → http://localhost:3000
npm run signaling      # WebRTC signal → ws://localhost:3002
npm run dev --workspace=family-web       # family portal   → http://localhost:5173
npm run dev --workspace=warden-dashboard # warden console  → http://localhost:3001
```

### First boot and the database

Point `DATABASE_URL` at an **empty** PostgreSQL database and start the backend:
it runs `backend/db-schema/*.sql` (001→004) and then seeds itself from
`backend/legacy-db/` — no manual schema step. Cells/blocks are created with
sensible defaults. The seed is non-destructive: collections that already hold
rows are skipped, so restarts and redeploys never wipe runtime-created records
(kiosk registrations, new inmates, wallet top-ups).

Two things to know:

- The auto-seed only triggers when the database has **zero** tables. A
  database that already has _some_ tables is left alone, so a half-migrated
  schema never gets repaired on its own. Fix that explicitly with
  `npm run seed --workspace=backend` (runs `migrate()` first, still
  non-destructive).
- `FORCE_SEED=true` (or `npm run seed:force --workspace=backend`) **wipes and
  re-seeds** every table from `legacy-db/`. Only use it on a database you are
  happy to discard.

If inmates exist without a wallet row, run `npm run backfill:wallets --workspace=backend`
(idempotent; `-- --dry-run` to preview). It writes zero-balance wallets and
stamps `walletId` back onto the inmate.

### Kiosk

Copy `android-kiosk/local.properties.example` to `android-kiosk/local.properties`
and point `API_BASE_URL` / `KIOSK_TRUST_API_HOST` at your backend host. The
kiosk only ever talks to the backend and the signaling server — never to
`family-web` or `warden-dashboard`.

## Code Standards

- **Indentation & Line Endings**: Defined via `.editorconfig`.
- **Formatting**: Prettier configuration (`.prettierrc`).
- **Linting**: ESLint flat config per web project.
