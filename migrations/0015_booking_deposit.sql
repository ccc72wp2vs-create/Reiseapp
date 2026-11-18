-- Anzahlung: a booking can point to the wallet expense of its down payment.
-- The remaining amount (price − deposit) is what is still open and what is
-- transferred to the wallet when the booking is fully paid. Additive only.
ALTER TABLE bookings ADD COLUMN deposit_expense_id TEXT REFERENCES expenses(id) ON DELETE SET NULL;
