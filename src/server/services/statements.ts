/**
 * Monthly statements: immutable, versioned snapshots that READ the ledger and never post
 * to it (PLANNING.md §5.2, §5.3).
 */
import type { MilkSession, SupplyType } from "@prisma/client";
import { computeStatementTotals, dec, sum, toKg } from "@/lib/calc";
import { nextDocNo, prisma, transaction, type Db, type Tx } from "@/lib/db";
import { isValidPeriod, periodRange } from "@/lib/dates";
import { forbidden, invalid, notFound } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { balance } from "./ledger";
import { reallocate } from "./payments";
import type { Actor } from "./types";

export interface QtyTotals {
  MORNING: { maan: string; kg: string; totalKg: string };
  EVENING: { maan: string; kg: string; totalKg: string };
  amount: string;
  days: number;
}

export interface SheetRow {
  entryId: string;
  date: string;
  noSupply: boolean;
  morning: { maan: string; kg: string; ratePerMaan: string; ratePerKg: string; amount: string } | null;
  evening: { maan: string; kg: string; ratePerMaan: string; ratePerKg: string; amount: string } | null;
  total: string;
}

/** Sheet-layout rows + quantity totals for one supply type (Bandhi / Mandi records). */
export async function sheetRows(db: Db, customerId: string, supplyType: SupplyType, start: Date, end: Date) {
  const entries = await db.milkEntry.findMany({
    where: { customerId, supplyType, voidedAt: null, entryDate: { gte: start, lte: end } },
    include: { sessions: true },
    orderBy: { entryDate: "asc" },
  });
  const rows: SheetRow[] = entries.map((e) => {
    const pick = (s: MilkSession) => {
      const x = e.sessions.find((y) => y.session === s);
      return x
        ? {
            maan: dec(x.maan).toString(),
            kg: dec(x.kg).toString(),
            ratePerMaan: dec(x.ratePerMaan).toString(),
            ratePerKg: dec(x.ratePerKg).toString(),
            amount: dec(x.amount).toFixed(2),
          }
        : null;
    };
    return { entryId: e.id, date: e.entryDate.toISOString().slice(0, 10), noSupply: e.noSupply, morning: pick("MORNING"), evening: pick("EVENING"), total: dec(e.totalAmount).toFixed(2) };
  });
  const tot = (s: "morning" | "evening") => {
    const maan = sum(rows.map((r) => r[s]?.maan ?? 0));
    const kg = sum(rows.map((r) => r[s]?.kg ?? 0));
    return { maan: maan.toString(), kg: kg.toString(), totalKg: toKg(maan, kg).toString() };
  };
  const totals: QtyTotals = { MORNING: tot("morning"), EVENING: tot("evening"), amount: sum(rows.map((r) => r.total)).toFixed(2), days: rows.length };
  return { rows, totals };
}

/** Compute a statement for any date range straight from the ledger (used by preview and generate). */
export async function computeStatement(db: Db, customerId: string, start: Date, end: Date) {
  const customer = await db.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw notFound("Customer");
  const prior = await balance(db, customerId, { before: start });
  const lines = await db.ledgerEntry.findMany({
    where: { customerId, txnDate: { gte: start, lte: end } },
    include: { reverses: { select: { txnType: true } } },
    orderBy: [{ txnDate: "asc" }, { createdAt: "asc" }],
  });
  const totals = computeStatementTotals(
    prior,
    lines.map((l) => ({ txnType: l.txnType, reversedType: l.reverses?.txnType ?? null, debit: l.debit, credit: l.credit })),
  );
  const [bandhi, mandi] = await Promise.all([
    sheetRows(db, customerId, "BANDHI", start, end),
    sheetRows(db, customerId, "MANDI", start, end),
  ]);
  const payments = await db.payment.findMany({
    where: { customerId, voidedAt: null, paymentDate: { gte: start, lte: end } },
    orderBy: { paymentDate: "asc" },
  });
  const adjustments = await db.adjustment.findMany({
    where: { customerId, voidedAt: null, adjDate: { gte: start, lte: end } },
    orderBy: { adjDate: "asc" },
  });
  return { customer, start, end, totals, bandhi, mandi, payments, adjustments };
}

export type ComputedStatement = Awaited<ReturnType<typeof computeStatement>>;

export async function previewStatement(customerId: string, start: Date, end: Date, db: Db = prisma) {
  if (end < start) throw invalid("End date must be on or after the start date.");
  return computeStatement(db, customerId, start, end);
}

/** Generate a new FINAL version for a customer + period; the previous FINAL becomes SUPERSEDED. */
export async function generateStatement(tx: Tx, actor: Actor, customerId: string, period: string, opts: { skipReallocate?: boolean } = {}) {
  if (!actor.permissions.has(PERMISSIONS.STATEMENTS_GENERATE)) throw forbidden();
  if (!isValidPeriod(period)) throw invalid("Invalid period.");
  const { start, end } = periodRange(period);
  const c = await computeStatement(tx, customerId, start, end);
  const last = await tx.monthlyStatement.findFirst({ where: { customerId, period }, orderBy: { version: "desc" } });
  await tx.monthlyStatement.updateMany({ where: { customerId, period, status: "FINAL" }, data: { status: "SUPERSEDED" } });
  const t = c.totals;
  const st = await tx.monthlyStatement.create({
    data: {
      statementNo: await nextDocNo(tx, "ST", start.getUTCFullYear()),
      customerId,
      period,
      version: (last?.version ?? 0) + 1,
      startDate: start,
      endDate: end,
      openingBalance: t.openingBalance.toFixed(2),
      totalBandhi: t.totalBandhi.toFixed(2),
      totalMandi: t.totalMandi.toFixed(2),
      totalMilk: t.totalMilk.toFixed(2),
      additionalCharges: t.additionalCharges.toFixed(2),
      payments: t.payments.toFixed(2),
      credits: t.credits.toFixed(2),
      closingBalance: t.closingBalance.toFixed(2),
      bandhiTotals: c.bandhi.totals as unknown as object,
      mandiTotals: c.mandi.totals as unknown as object,
      status: "FINAL",
      generatedBy: actor.id,
    },
  });
  if (!opts.skipReallocate) await reallocate(tx, customerId);
  await audit(actor.id, "GENERATE", "MonthlyStatement", st.id, { newValues: { statementNo: st.statementNo, period, version: st.version, closing: st.closingBalance }, ip: actor.ip }, tx);
  return st;
}

export async function generateStatementTx(actor: Actor, customerId: string, period: string) {
  return transaction((tx) => generateStatement(tx, actor, customerId, period));
}

export async function listStatements(f: { customerId?: string; period?: string } = {}, db: Db = prisma) {
  return db.monthlyStatement.findMany({
    where: { customerId: f.customerId, period: f.period },
    include: { customer: { select: { id: true, name: true, code: true } } },
    orderBy: [{ period: "desc" }, { customer: { name: "asc" } }, { version: "desc" }],
    take: 500,
  });
}

export async function getStatement(id: string, db: Db = prisma) {
  const st = await db.monthlyStatement.findUnique({ where: { id }, include: { customer: true, allocations: { include: { payment: true } } } });
  if (!st) throw notFound("Statement");
  // Line items are re-read from the (immutable, append-only) source rows for the period.
  const detail = await computeStatement(db, st.customerId, st.startDate, st.endDate);
  return { st, detail };
}
