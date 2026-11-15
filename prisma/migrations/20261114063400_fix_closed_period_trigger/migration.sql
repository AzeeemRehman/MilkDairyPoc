-- The date column is passed as a trigger argument and read through to_jsonb(), because
-- PL/pgSQL cannot reference NEW."<col>" for columns that do not exist on every table.
CREATE OR REPLACE FUNCTION reject_closed_period() RETURNS trigger AS $$
DECLARE
  col text := TG_ARGV[0];
  p varchar(7);
BEGIN
  p := to_char((to_jsonb(NEW) ->> col)::date, 'YYYY-MM');
  IF EXISTS (SELECT 1 FROM "AccountingPeriod" WHERE "period" = p AND "status" = 'CLOSED') THEN
    RAISE EXCEPTION 'PERIOD_CLOSED: % is closed', p USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    p := to_char((to_jsonb(OLD) ->> col)::date, 'YYYY-MM');
    IF EXISTS (SELECT 1 FROM "AccountingPeriod" WHERE "period" = p AND "status" = 'CLOSED') THEN
      RAISE EXCEPTION 'PERIOD_CLOSED: % is closed', p USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS milk_entry_closed_guard ON "MilkEntry";
DROP TRIGGER IF EXISTS payment_closed_guard ON "Payment";
DROP TRIGGER IF EXISTS adjustment_closed_guard ON "Adjustment";
DROP TRIGGER IF EXISTS ledger_closed_guard ON "LedgerEntry";

CREATE TRIGGER milk_entry_closed_guard BEFORE INSERT OR UPDATE ON "MilkEntry"
  FOR EACH ROW EXECUTE FUNCTION reject_closed_period('entryDate');
CREATE TRIGGER payment_closed_guard BEFORE INSERT OR UPDATE ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION reject_closed_period('paymentDate');
CREATE TRIGGER adjustment_closed_guard BEFORE INSERT OR UPDATE ON "Adjustment"
  FOR EACH ROW EXECUTE FUNCTION reject_closed_period('adjDate');
CREATE TRIGGER ledger_closed_guard BEFORE INSERT OR UPDATE ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION reject_closed_period('txnDate');
