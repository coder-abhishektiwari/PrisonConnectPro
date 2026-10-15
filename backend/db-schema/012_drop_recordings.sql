-- 012: recordings never leave the kiosk.
-- The kiosk records locally and never registers, uploads or retrieves
-- anything. Nothing in the dashboard displays a recording either, so every
-- /recordings route was dead code and the table held only seed fixtures and
-- audit-suite rows. The kiosk keeps its own on-device copy; this table was the
-- backend's (empty) mirror of it.
DROP TABLE IF EXISTS recordings;
