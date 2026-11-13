-- Joint payments: remember the cost expense (e.g. rent) paid together with
-- the deposit, so the deposit details can show the fair overall split.
ALTER TABLE deposits ADD COLUMN cost_expense_id TEXT REFERENCES expenses(id) ON DELETE SET NULL;
