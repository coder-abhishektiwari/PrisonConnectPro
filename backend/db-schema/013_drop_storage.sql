-- 013: the storage singleton is dead.
--
-- `storage` was a singleton_config row that only GET /storage read, and the
-- vendor StoragePage that used it is gone. Nothing else (warden, kiosk,
-- family) ever asked how much disk the backend had, so the row and its route
-- were pure dead weight.
DELETE FROM singleton_config WHERE id = 'storage';
