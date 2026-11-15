-- Constraints Prisma's schema language cannot express (PLANNING.md §5.2, §6).

-- One active milk entry per customer + date + supply type.
CREATE UNIQUE INDEX "MilkEntry_active_unique"
  ON "MilkEntry" ("customerId", "entryDate", "supplyType") WHERE "voidedAt" IS NULL;

-- A source document can never be charged twice: one ACTIVE ledger line per source.
CREATE UNIQUE INDEX "LedgerEntry_active_source_unique"
  ON "LedgerEntry" ("sourceType", "sourceId") WHERE "isActive";

-- Exactly one of debit / credit, never negative.
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_debit_credit_check"
  CHECK ("debit" >= 0 AND "credit" >= 0 AND (("debit" = 0) <> ("credit" = 0)));

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "Adjustment" ADD CONSTRAINT "Adjustment_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "MilkEntrySession" ADD CONSTRAINT "MilkEntrySession_nonneg"
  CHECK ("maan" >= 0 AND "kg" >= 0 AND "ratePerMaan" >= 0 AND "ratePerKg" >= 0 AND "amount" >= 0);
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_amount_positive" CHECK ("amount" > 0);

-- Only one FINAL statement per customer + period.
CREATE UNIQUE INDEX "MonthlyStatement_one_final"
  ON "MonthlyStatement" ("customerId", "period") WHERE "status" = 'FINAL';

-- Rate history: no overlapping date ranges per customer / supply type / session.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "CustomerRate" ADD CONSTRAINT "CustomerRate_no_overlap"
  EXCLUDE USING gist (
    "customerId" WITH =,
    "supplyType" WITH =,
    "session" WITH =,
    daterange("effectiveFrom", COALESCE("effectiveTo", 'infinity'::date), '[]') WITH &&
  );

-- Closed-period guard (safety net behind the service-layer check).
CREATE OR REPLACE FUNCTION reject_closed_period() RETURNS trigger AS $$
DECLARE
  d date;
  p varchar(7);
BEGIN
  d := CASE TG_TABLE_NAME
         WHEN 'MilkEntry'   THEN NEW."entryDate"
         WHEN 'Payment'     THEN NEW."paymentDate"
         WHEN 'Adjustment'  THEN NEW."adjDate"
         WHEN 'LedgerEntry' THEN NEW."txnDate"
       END;
  p := to_char(d, 'YYYY-MM');
  IF EXISTS (SELECT 1 FROM "AccountingPeriod" WHERE "period" = p AND "status" = 'CLOSED') THEN
    RAISE EXCEPTION 'PERIOD_CLOSED: % is closed', p USING ERRCODE = 'check_violation';
  END IF;
  -- An UPDATE that moves a row out of a closed period is also rejected.
  IF TG_OP = 'UPDATE' THEN
    d := CASE TG_TABLE_NAME
           WHEN 'MilkEntry'   THEN OLD."entryDate"
           WHEN 'Payment'     THEN OLD."paymentDate"
           WHEN 'Adjustment'  THEN OLD."adjDate"
           WHEN 'LedgerEntry' THEN OLD."txnDate"
         END;
    p := to_char(d, 'YYYY-MM');
    IF EXISTS (SELECT 1 FROM "AccountingPeriod" WHERE "period" = p AND "status" = 'CLOSED') THEN
      RAISE EXCEPTION 'PERIOD_CLOSED: % is closed', p USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER milk_entry_closed_guard BEFORE INSERT OR UPDATE ON "MilkEntry"
  FOR EACH ROW EXECUTE FUNCTION reject_closed_period();
CREATE TRIGGER payment_closed_guard BEFORE INSERT OR UPDATE ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION reject_closed_period();
CREATE TRIGGER adjustment_closed_guard BEFORE INSERT OR UPDATE ON "Adjustment"
  FOR EACH ROW EXECUTE FUNCTION reject_closed_period();
CREATE TRIGGER ledger_closed_guard BEFORE INSERT OR UPDATE ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION reject_closed_period();

-- Ledger is append-only: lines can be deactivated (reversed) but never deleted.
CREATE OR REPLACE FUNCTION reject_ledger_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Ledger entries cannot be deleted';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER ledger_no_delete BEFORE DELETE ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION reject_ledger_delete();
