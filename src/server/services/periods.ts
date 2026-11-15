/** Accounting periods: closed-period guard, monthly close / reopen (PLANNING.md §11). */
import { dec } from "@/lib/calc";
import { prisma, transaction, type Db, type Tx } from "@/lib/db";
import { eachDay, isoDate, isValidPeriod, periodOf, periodRange, previousPeriod } from "@/lib/dates";
import { conflict, forbidden, invalid, periodClosed } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { balance, balances } from "./ledger";
import { generateStatement } from "./statements";
import { reallocate } from "./payments";
import type { Actor } from "./types";

export async function periodStatus(db: Db, period: string) {
  const row = await db.accountingPeriod.findUnique({ where: { period } });
  return row?.status ?? "OPEN";
}

/** Server-side closed-period guard (a DB trigger is the safety net). */
export async function assertPeriodOpen(db: Db, date: Date) {
  const p = periodOf(date);
  if ((await periodStatus(db, p)) === "CLOSED") throw periodClosed(p);
}

export interface PreCloseWarning {
  kind: "MISSING_BANDHI_DAYS" | "ADVANCE_BALANCE" | "ALREADY_CLOSED";
  message: string;
  customerId?: string;
}

/** Warnings only — they do not block closing. */
export async function preCloseChecks(period: string, db: Db = prisma): Promise<PreCloseWarning[]> {
  const { start, end } = periodRange(period);
  const warnings: PreCloseWarning[] = [];
  const bandhiCustomers = await db.customer.findMany({
    where: { status: "ACTIVE", customerType: { in: ["BANDHI", "BOTH"] } },
    select: {
      id: true,
      name: true,
      rates: { where: { supplyType: "BANDHI", effectiveFrom: { lte: end } }, select: { effectiveFrom: true, effectiveTo: true } },
      milkEntries: { where: { supplyType: "BANDHI", voidedAt: null, entryDate: { gte: start, lte: end } }, select: { entryDate: true } },
    },
  });
  for (const c of bandhiCustomers) {
    const have = new Set(c.milkEntries.map((e) => isoDate(e.entryDate)));
    const missing = eachDay(start, end).filter(
      (d) => !have.has(isoDate(d)) && c.rates.some((r) => r.effectiveFrom <= d && (!r.effectiveTo || r.effectiveTo >= d)),
    );
    if (missing.length)
      warnings.push({
        kind: "MISSING_BANDHI_DAYS",
        customerId: c.id,
        message: `${c.name}: ${missing.length} day(s) without a Bandhi entry (${missing.slice(0, 5).map(isoDate).join(", ")}${missing.length > 5 ? "…" : ""})`,
      });
  }
  const bal = await balances(db, end);
  const names = new Map((await db.customer.findMany({ select: { id: true, name: true } })).map((c) => [c.id, c.name]));
  for (const [id, b] of bal) {
    if (b.isNeg()) warnings.push({ kind: "ADVANCE_BALANCE", customerId: id, message: `${names.get(id)}: advance (unallocated) of ${b.abs().toFixed(2)}` });
  }
  if ((await periodStatus(db, period)) === "CLOSED") warnings.push({ kind: "ALREADY_CLOSED", message: `${period} is already closed.` });
  return warnings;
}

async function lockPeriod(tx: Tx, period: string) {
  await tx.accountingPeriod.upsert({ where: { period }, create: { period }, update: {} });
  await tx.$queryRaw`SELECT id FROM "AccountingPeriod" WHERE period = ${period} FOR UPDATE`;
  return tx.accountingPeriod.findUniqueOrThrow({ where: { period } });
}

/** Generate + reconcile FINAL statements for every customer with activity or a non-zero balance. */
async function generateAndReconcile(tx: Tx, actor: Actor, period: string) {
  const { start, end } = periodRange(period);
  const active = await tx.ledgerEntry.findMany({ where: { period }, select: { customerId: true }, distinct: ["customerId"] });
  const bal = await balances(tx, end);
  const ids = new Set<string>(active.map((a) => a.customerId));
  for (const [id, b] of bal) if (!b.isZero()) ids.add(id);

  const mismatches: string[] = [];
  for (const customerId of ids) {
    const st = await generateStatement(tx, actor, customerId, period, { skipReallocate: true });
    // §5.3 invariant 1: closing == ledger balance at period end
    const ledgerBal = await balance(tx, customerId, { asOf: end });
    if (!dec(st.closingBalance).eq(ledgerBal)) mismatches.push(`${customerId}: closing ${st.closingBalance} ≠ ledger ${ledgerBal.toFixed(2)}`);
    // §5.3 invariant 2: opening == previous month's FINAL closing, once that month is CLOSED
    // (a statement of a still-open month may be stale by design).
    const prevPeriod = previousPeriod(period);
    if ((await periodStatus(tx, prevPeriod)) === "CLOSED") {
      const prev = await tx.monthlyStatement.findFirst({ where: { customerId, period: prevPeriod, status: "FINAL" } });
      const expected = prev ? dec(prev.closingBalance) : await balance(tx, customerId, { before: start });
      if (!expected.eq(dec(st.openingBalance)))
        mismatches.push(`${customerId}: opening ${st.openingBalance} ≠ previous closing ${expected.toFixed(2)}`);
    }
    await reallocate(tx, customerId);
  }
  if (mismatches.length) throw conflict(`Reconciliation failed, close aborted:\n${mismatches.join("\n")}`);
  return ids.size;
}

export async function closePeriod(actor: Actor, period: string) {
  if (!actor.permissions.has(PERMISSIONS.PERIOD_CLOSE)) throw forbidden();
  if (!isValidPeriod(period)) throw invalid("Invalid period.");
  return transaction(async (tx) => {
    const row = await lockPeriod(tx, period);
    if (row.status === "CLOSED") throw conflict(`${period} is already closed.`);
    const count = await generateAndReconcile(tx, actor, period);
    await tx.accountingPeriod.update({
      where: { period },
      data: { status: "CLOSED", closedAt: new Date(), closedBy: actor.id, needsReclose: false },
    });
    // Re-closing a reopened month changes the balances carried into later closed months:
    // regenerate their statements as new versions (originals stay as SUPERSEDED).
    const later = await tx.accountingPeriod.findMany({ where: { period: { gt: period }, status: "CLOSED" }, orderBy: { period: "asc" } });
    for (const p of later) await generateAndReconcile(tx, actor, p.period);
    await audit(actor.id, "PERIOD_CLOSE", "AccountingPeriod", row.id, { newValues: { period, statements: count, regenerated: later.map((l) => l.period) }, ip: actor.ip }, tx);
    return { statements: count, regenerated: later.map((l) => l.period) };
  });
}

export async function reopenPeriod(actor: Actor, period: string, reason: string) {
  if (!actor.permissions.has(PERMISSIONS.PERIOD_REOPEN)) throw forbidden("Only an admin can reopen a period.");
  if (!reason?.trim()) throw invalid("A reason is required to reopen a period.", { reason: "Required" });
  return transaction(async (tx) => {
    const row = await lockPeriod(tx, period);
    if (row.status !== "CLOSED") throw conflict(`${period} is not closed.`);
    await tx.accountingPeriod.update({
      where: { period },
      data: { status: "REOPENED", reopenedAt: new Date(), reopenedBy: actor.id, reopenReason: reason.trim(), needsReclose: true },
    });
    await tx.accountingPeriod.updateMany({ where: { period: { gt: period }, status: "CLOSED" }, data: { needsReclose: true } });
    await audit(actor.id, "PERIOD_REOPEN", "AccountingPeriod", row.id, { reason, ip: actor.ip }, tx);
  });
}

export async function listPeriods(db: Db = prisma) {
  return db.accountingPeriod.findMany({ orderBy: { period: "desc" } });
}
