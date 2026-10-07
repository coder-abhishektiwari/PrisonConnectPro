-- Kiosk ward/block and location are merged into the single location field.
-- Ward was never a real column (it is derived from the assigned inmates at
-- read time), and the assignedBlock/assignedCellArea keys written during
-- registration were never read anywhere - drop them from the JSONB record.
UPDATE kiosks
   SET data = data - 'assignedBlock' - 'assignedCellArea'
 WHERE data ? 'assignedBlock' OR data ? 'assignedCellArea';
