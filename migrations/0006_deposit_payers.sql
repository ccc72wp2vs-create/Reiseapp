-- Several travelers can put down a deposit together (amounts in the deposit
-- currency, summing to deposits.amount_minor). deposits.paid_by_traveler_id
-- stays as the main payer for compatibility.
CREATE TABLE deposit_payers (
  deposit_id   TEXT NOT NULL REFERENCES deposits(id) ON DELETE CASCADE,
  traveler_id  TEXT NOT NULL REFERENCES travelers(id) ON DELETE CASCADE,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  PRIMARY KEY (deposit_id, traveler_id)
);

INSERT INTO deposit_payers (deposit_id, traveler_id, amount_minor)
SELECT id, paid_by_traveler_id, amount_minor FROM deposits;
