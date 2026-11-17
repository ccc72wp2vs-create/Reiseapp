-- One automatic (ECB) rate per trip, currency and day – concurrent refreshes
-- from several devices must not store it twice. Removes existing duplicates
-- of automatic rates only (identical copies); manual rates are untouched.
DELETE FROM exchange_rates
WHERE source = 'provider'
  AND rowid NOT IN (
    SELECT MIN(rowid) FROM exchange_rates WHERE source = 'provider' GROUP BY trip_id, currency, effective_date
  );
CREATE UNIQUE INDEX idx_exchange_rates_provider_day ON exchange_rates(trip_id, currency, effective_date) WHERE source = 'provider';
