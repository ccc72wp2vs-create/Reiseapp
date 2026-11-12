-- An expense can be paid by several travelers together.
-- amount_minor: paid amount in the expense currency;
-- base_amount_minor: the same in the trip base currency (sums exactly to the
-- expense's base_amount_minor). expenses.paid_by_traveler_id stays as the
-- main payer for compatibility.
CREATE TABLE expense_payers (
  expense_id         TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  traveler_id        TEXT NOT NULL REFERENCES travelers(id),
  amount_minor       INTEGER NOT NULL CHECK (amount_minor > 0),
  base_amount_minor  INTEGER NOT NULL CHECK (base_amount_minor >= 0),
  PRIMARY KEY (expense_id, traveler_id)
);
CREATE INDEX idx_expense_payers_traveler ON expense_payers(traveler_id);

INSERT INTO expense_payers (expense_id, traveler_id, amount_minor, base_amount_minor)
SELECT id, paid_by_traveler_id, amount_minor, base_amount_minor FROM expenses;
