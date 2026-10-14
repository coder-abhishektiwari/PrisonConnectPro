-- 010: the auto-generated jail code ("JAIL-XXXXXX") was a cosmetic duplicate of
-- the prison id — generated once at registration, never read by any lookup,
-- auth or display logic. Strip it so it cannot resurface through the read path.
UPDATE prisons SET data = data - 'code';
