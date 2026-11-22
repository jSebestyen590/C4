-- Existing protocols are the normal ones (idempotent).
UPDATE protokolle SET fassung = 'normal' WHERE fassung IS NULL