# PrisonConnect — Prison Video Calling & Monitoring System

Centralized, secure video and audio communication platform designed for inmate-to-family calls managed and monitored by Jail Administration.

## System Architecture Overview

PrisonConnect provides a multi-tenant, secure ecosystem consisting of:

- **`android-kiosk/`**: Native Android Application (Kotlin) running on hardware kiosks for inmate multi-modal authentication (RFID, Biometric, Face ID), call scheduling, balance checks, WebRTC audio/video streams, live billing, and receipt printing.
- **`family-web/`**: Browser-based React + TypeScript web client requiring zero application download for verified family members joining scheduled encrypted calls.
- **`warden-dashboard/`**: React + TypeScript administration portal for silent live call monitoring, call control (mute/disconnect), inmate profile management, prisoner trust account management, recording center, kiosk health monitoring, and SaaS multi-jail management.
- **`docs/`**: Complete architectural diagrams, infrastructure design, security policies, and technical specifications.

## Repository Structure

```text
PrisonConnect/
 ├── android-kiosk/       # Kotlin Kiosk Client
 ├── family-web/          # React + Vite Family Web Portal
 ├── warden-dashboard/    # React + Vite Warden & SaaS Admin Console
 └── docs/                # Architecture & System Documentation
```

## Setup & Environment Configuration

Each component contains an `.env.example` or `local.properties.example` template:

1. Copy `.env.example` to `.env` in `family-web/` and `warden-dashboard/`.
2. Copy `local.properties.example` to `local.properties` in `android-kiosk/`.
3. Configure Signaling Server (Node.js/WebSocket), Media Server (Mediasoup SFU / Coturn TURN), and Trust Account API endpoints.

## Code Standards

- **Indentation & Line Endings**: Defined via `.editorconfig`.
- **Formatting**: Prettier configuration (`.prettierrc`).
- **Linting**: ESLint flat config per web project.
