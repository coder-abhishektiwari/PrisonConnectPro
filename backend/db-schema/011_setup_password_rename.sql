-- 011: the facility setup secret grows from a 6-digit PIN into a real password
-- (8-64 chars, letters + numbers). Same bcrypt hash, new document keys.
-- Everything lives inside prisons.data — there has never been a setup_pin
-- column and the separate setup_pins table was already dropped in 005.

-- 1. Password change requests array key.
UPDATE prisons
   SET data = (data || jsonb_build_object('passwordChangeRequests', data -> 'pinChangeRequests')) - 'pinChangeRequests'
 WHERE data ? 'pinChangeRequests';

-- 2. The pending request payload: newPinHash -> newPasswordHash.
UPDATE prisons
   SET data = jsonb_set(data, '{passwordChangeRequests}', COALESCE((
         SELECT jsonb_agg(
           ((r - 'newPinHash') || jsonb_build_object('newPasswordHash', r -> 'newPinHash'))
           ORDER BY ord
         )
         FROM jsonb_array_elements(data -> 'passwordChangeRequests') WITH ORDINALITY AS e(r, ord)
       ), '[]'::jsonb))
 WHERE data ? 'passwordChangeRequests';

-- 3. The secret itself: setupPin -> setupPassword (value already bcrypt-hashed).
UPDATE prisons
   SET data = (data || jsonb_build_object('setupPassword', data -> 'setupPin')) - 'setupPin'
 WHERE data ? 'setupPin';
