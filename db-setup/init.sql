-- Executed automatically by the postgres container on first boot.
-- The app user/database are created from POSTGRES_USER/POSTGRES_DB env vars.
ALTER ROLE prisonconnect SET timezone TO 'UTC';
ALTER DATABASE prisonconnect SET timezone TO 'UTC';
