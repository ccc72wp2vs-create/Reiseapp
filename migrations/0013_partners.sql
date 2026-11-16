-- Couples: each traveler can name one partner of the same trip (kept mutual by
-- the API). Used to show balances and settlements per couple. Additive only.
ALTER TABLE travelers ADD COLUMN partner_id TEXT REFERENCES travelers(id) ON DELETE SET NULL;
