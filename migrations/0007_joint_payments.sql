-- Deposit returns: when one person gets the deposit money back, the shares
-- of the other contributors are recorded as internal settlements
-- (payer → receiver), linked to the deposit so they can be undone together.
ALTER TABLE settlements ADD COLUMN deposit_id TEXT REFERENCES deposits(id) ON DELETE CASCADE;
ALTER TABLE deposits ADD COLUMN returned_to_traveler_id TEXT REFERENCES travelers(id) ON DELETE SET NULL;
CREATE INDEX idx_settlements_deposit ON settlements(deposit_id);
