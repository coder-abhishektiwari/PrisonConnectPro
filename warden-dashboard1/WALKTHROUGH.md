# PrisonConnect Warden Dashboard — Operations Console Walkthrough

## Overview

The Jail Warden Dashboard has been transformed into a production-grade **Monitoring Console** that consumes data exclusively from the existing Shared Mock Backend. All modules use the mock backend as the single source of truth, and real-time updates are handled via Socket.IO.

---

## New & Enhanced Modules

### 1. Live Monitoring Dashboard (`/monitoring/live`)
- **Active Room Cards**: Displays every active call with 13 metadata fields:
    - Prisoner Name, Family Member, Room ID, Prison, Kiosk, Call Type, Call Duration, Recording Status, Signal Strength, Bitrate, Packet Loss, Network Type, Connection State.
- **Visual Indicators**: Pulse indicators for active recordings, color-coded quality states, and signal strength bars.
- **Navigation**: "Monitor" button opens the dedicated Monitor Screen.

### 2. Dedicated Monitor Screen (`/monitoring/live/:callId`)
- **Video Area**: Dedicated space for remote video and local warden preview (currently placeholders).
- **Session Timeline**: Real-time event log tracking:
    - Call Started, Participant Joined, ICE Connected, Recording Started, Warnings, Call Ended.
- **Call Controls**: Warden-only controls that synchronize with the mock backend:
    - Mute Prisoner/Family, Disable Camera, Pause/Resume Recording, Force Disconnect, Generate Incident Report.
- **Call Statistics**: Live sparkline graphs for real-time connection telemetry:
    - Packet Loss, Latency, Bitrate, Jitter, Audio Level, FPS, Network Health.
- **Information Panels**: Detailed Prisoner Info, Family Info, Wallet Balance, and Call Charges.
- **Recording Panel**: Tracking of Recording ID, Duration, Encryption, and Retention Policy.
- **Security Panel**: Multi-factor verification status (Face, RFID, OTP, Browser) and device fingerprinting (IP, Location, VPN, Developer Mode).

### 3. Incident Reporting
- **In-Session Reporting**: Warden can generate incidents directly from the monitor screen.
- **Fields**: Category (Security, Behavioral, etc.), Severity (Low, Medium, High), Remarks, Timestamp, and Officer Name.
- **Persistence**: Incidents are stored in `incidents.json` in the Shared Mock Backend and synchronized across all warden consoles.

---

## Mock Backend Synchronization

### New Data Structures
- `incidents.json`: Stores all reported incidents with unique IDs and call associations.
- `statistics.json`: Stores real-time connection telemetry snapshots.

### New API Endpoints
- `GET /incidents`: Retrieve all incidents.
- `POST /incidents`: Create a new incident report.
- `GET /statistics/:callId`: Get latest stats for a call.
- `PATCH /statistics/:callId`: Update live stats for a call.
- `POST /calls/:callId/control`: Broadcast warden control actions (mute, disconnect).

### Enhanced Socket.IO Events
- `incident-created`: Notifies dashboards to refresh incident logs.
- `statistics-updated`: Pushes live telemetry to active monitoring screens.
- `call-control`: Broadcasts warden actions to kiosks and web clients.

---

## Folder Changes

### Modified Files
| File | Change |
|------|--------|
| `warden-dashboard/src/services/api/wardenApi.ts` | Added types and methods for Incidents, Statistics, and Call Control. |
| `warden-dashboard/src/hooks/useWardenSocket.ts` | Added handlers for `incident-created`, `statistics-updated`, and `call-control` events. |
| `warden-dashboard/src/pages/LiveMonitoringPage.tsx` | Redesigned with 13-field metadata cards and navigation. |
| `warden-dashboard/src/pages/ActiveCallsPage.tsx` | Updated "Monitor" button to navigate to dedicated screen. |
| `warden-dashboard/src/routes/index.tsx` | Added route for the dedicated Monitor Screen. |
| `mock-backend/src/server.js` | Implemented 5 new endpoints for monitoring and control. |

### New Files
| File | Purpose |
|------|---------|
| `warden-dashboard/src/pages/MonitorScreenPage.tsx` | The central command interface for monitoring individual calls. |
| `mock-backend/db/incidents.json` | Persistent storage for warden-generated reports. |
| `mock-backend/db/statistics.json` | Storage for connection quality telemetry. |

---

## Remaining Work Before Real Backend Integration

### 1. WebRTC Streaming
- Replace video/audio placeholders with actual WebRTC streams via Mediasoup SFU.
- Implement silent monitoring role (receive-only) for wardens.

### 2. Live Telemetry
- Replace simulated statistics with real `RTCPeerConnection` stats.

### 3. Action Execution
- Implement actual signal handling in Android Kiosk and Family Web for warden controls (mute, disable camera).

### 4. Encryption Keys
- Implement secure retrieval of encryption keys for recording playback (WORM vault).

---

## Build Verification

```bash
# Build the warden dashboard
npm run build --workspace=warden-dashboard

# Start the mock backend
node mock-backend/src/server.js
```

The project builds successfully with zero TypeScript errors.
