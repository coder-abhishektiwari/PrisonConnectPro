-- 012: recordings never leave the kiosk.
-- The kiosk runs with RECORDINGS_LOCAL_ONLY=true, so it records locally and
-- never registers, uploads or retrieves anything. Nothing in the dashboard
-- displays a recording either, so every /recordings route was dead code and
-- the table held only seed fixtures and audit-suite rows. The kiosk keeps its
-- own on-device copy; this table is the backend's (empty) mirror of it.
DROP TABLE IF EXISTS recordings;
