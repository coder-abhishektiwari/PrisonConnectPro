# Public URLs without a router (no port forwarding)

This machine has **no router access** and a **dynamic public IP**. Everything
public goes through outbound-only tunnels, so nothing ever needs port
forwarding — and the Android APK is built **once**.

## Architecture

| Service        | Runs in      | Public access                          | Stable? |
|----------------|--------------|----------------------------------------|---------|
| PostgreSQL     | Docker       | internal only                          | n/a     |
| coturn (TURN)  | Docker       | playit.gg tunnels (`:3478`, `:5349`)   | YES     |
| signaling      | Docker       | cloudflared quick tunnel               | URL changes per run* |
| backend API    | Docker       | LAN IP or one playit TCP tunnel        | YES (with playit) |
| family-web     | host (vite)  | cloudflared quick tunnel               | URL changes per run (fine — SMS link is generated fresh per call) |

Calls are **pure 1-to-1 P2P WebRTC**: media flows directly between the Android
kiosk and the family browser. There is no media server and no RTC port range to
tunnel — coturn exists only as an ICE connectivity fallback.

\* The backend now returns the current public signaling URL inside every
`POST /calls` response (`signalingUrl` field). The Android kiosk applies it at
runtime (`AppConfig.signalingUrlOverride`), so a changing tunnel URL never
requires an APK rebuild.

## One-time playit.gg setup (~10 minutes)

playit gives you a stable address (e.g. `tissues-cafeteria.tun.ply.gg`) and
fixed external ports that survive home-IP changes.

1. Log in to https://playit.gg → your agent.
2. **TURN (already done):** TCP+UDP tunnels → local `3478`, TCP → local `5349`.
3. **Backend API (recommended):** create ONE TCP tunnel → local port `59354`.
   Put its `host:port` into `android-kiosk/local.properties` as
   `API_BASE_URL=http://<playit-host>:<port>` and build the APK once. It will
   work from any network, forever.

## Daily usage

Just run `start.bat`. It:
1. starts Docker containers: postgres, coturn, signaling-server, backend;
2. opens cloudflared tunnels for signaling + web frontends and writes the
   fresh signaling URL into `.env` / frontend envs before the backend starts;
3. prints every URL in the summary.

Press any key in the launcher window to stop everything cleanly.

## Troubleshooting: Docker "pipe cannot find file" errors

If you repeatedly see this in any terminal:

```
error during connect: ... open //./pipe/dockerDesktopLinuxEngine:
The system cannot find the file specified.
```

Docker Desktop's backend has crashed (check
`%LOCALAPPDATA%\Docker\log\host\monitor.log` for
`com.docker.backend.exe services: exit status 0xffffffff`). Recovery:

```bat
taskkill /IM "Docker Desktop.exe" /F
taskkill /IM "com.docker.backend.exe" /F
wsl --shutdown
wsl --update
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
:: wait ~60s, then: docker ps
```

Then re-run `start.bat`. If it crashes again within minutes, update or
reinstall Docker Desktop (Settings > Software updates), and make sure WSL2
is current (`wsl --version`).
