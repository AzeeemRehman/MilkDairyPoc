/**
 * Append-only customer ledger (PLANNING.md §5). The single source of truth for balances.
 * Every business document posts exactly one *active* line (unique per source while active).
 * Corrections post a REVERSAL line and deactivate the original; nothing is ever deleted.
 */
import type { SourceType, TxnType } from "@prisma/client";
import { dec, money, type NumLike } from "@/lib/calc";
import { nextDocNo, type Db, type Tx } from "@/lib/db";
import { periodOf } from "@/lib/dates";
import { invalid } from "@/lib/errors";

export interface PostInput {
  customerId: string;
  txnDate: Date;
  txnType: TxnType;
  description: string;
  debit?: NumLike;
  credit?: NumLike;
  sourceType: SourceType;
  sourceId: string;
  userId: string | null;
}

export async function post(tx: Tx, i: PostInput) {
  const debit = money(i.debit);
  const credit = money(i.credit);
  if (debit.isNeg() || credit.isNeg()) throw invalid("Ledger amounts cannot be negative.");
  if (debit.isZero() === credit.isZero()) throw invalid("A ledger line needs exactly one of debit or credit.");
  return tx.ledgerEntry.create({
    data: {
      customerId: i.customerId,
      txnNo: await nextDocNo(tx, "LG", i.txnDate.getUTCFullYear()),
      txnDate: i.txnDate,
      period: periodOf(i.txnDate),
      txnType: i.txnType,
      description: i.description,
      debit: debit.toFixed(2),
      credit: credit.toFixed(2),
      sourceType: i.sourceType,
      sourceId: i.sourceId,
      isActive: true,
      createdBy: i.userId,
    },
  });
}

/**
 * Post a signed amount: positive → debit, negative → credit, zero → nothing.
 * Used for opening balances (which may be an advance).
 */
export async function postSigned(tx: Tx, i: Omit<PostInput, "debit" | "credit"> & { amount: NumLike }) {
  const a = money(i.amount);
  if (a.isZero()) return null;
  return post(tx, { ...i, debit: a.isPos() ? a : 0, credit: a.isNeg() ? a.abs() : 0 });
}

/** Reverse the active line of a source document (if any). Returns the reversal line. */
export async function reverseSource(tx: Tx, sourceType: SourceType, sourceId: string, userId: string | null, reason: string) {
  const active = await tx.ledgerEntry.findFirst({ where: { sourceType, sourceId, isActive: true } });
  if (!active) return null;
  await tx.ledgerEntry.update({ where: { id: active.id }, data: { isActive: false } });
  return tx.ledgerEntry.create({
    data: {
      customerId: active.customerId,
      txnNo: await nextDocNo(tx, "LG", active.txnDate.getUTCFullYear()),
      txnDate: active.txnDate,
      period: active.period,
      txnType: "REVERSAL",
      description: `Reversal of ${active.txnNo}: ${reason}`.slice(0, 500),
      debit: active.credit,
      credit: active.debit,
      sourceType,
      sourceId,
      reversesId: active.id,
      isActive: false,
      createdBy: userId,
    },
  });
}

/** Balance = Σ debit − Σ credit, optionally as of a date (inclusive) or before a date (exclusive). */
export async function balance(db: Db, customerId: string, opts: { asOf?: Date; before?: Date } = {}) {
  const r = await db.ledgerEntry.aggregate({
    where: {
      customerId,
      txnDate: opts.asOf ? { lte: opts.asOf } : opts.before ? { lt: opts.before } : undefined,
    },
    _sum: { debit: true, credit: true },
  });
  return dec(r._sum.debit).minus(dec(r._sum.credit));
}

/** Balances for many customers at once. */
export async function balances(db: Db, asOf?: Date): Promise<Map<string, ReturnType<typeof dec>>> {
  const rows = await db.ledgerEntry.groupBy({
    by: ["customerId"],
    where: asOf ? { txnDate: { lte: asOf } } : undefined,
    _sum: { debit: true, credit: true },
  });
  return new Map(rows.map((r) => [r.customerId, dec(r._sum.debit).minus(dec(r._sum.credit))]));
}

export interface LedgerRow {
  id: string;
  txnNo: string;
  txnDate: Date;
  txnType: TxnType;
  description: string;
  debit: string;
  credit: string;
  balance: string;
  sourceType: SourceType;
  sourceId: string;
  isActive: boolean;
  isReversal: boolean;
}

/** Ledger with running balance. Hidden reversals still count toward the running balance. */
export async function getLedger(db: Db, customerId: string, from: Date, to: Date, hideReversals = false) {
  const opening = await balance(db, customerId, { before: from });
  const lines = await db.ledgerEntry.findMany({
    where: { customerId, txnDate: { gte: from, lte: to } },
    orderBy: [{ txnDate: "asc" }, { createdAt: "asc" }],
  });
  let running = opening;
  let totalDebit = dec(0);
  let totalCredit = dec(0);
  const rows: LedgerRow[] = [];
  for (const l of lines) {
    running = running.plus(dec(l.debit)).minus(dec(l.credit));
    totalDebit = totalDebit.plus(dec(l.debit));
    totalCredit = totalCredit.plus(dec(l.credit));
    // A reversed original + its reversal cancel out; hiding both keeps the view clean.
    const hiddenPair = !l.isActive;
    if (hideReversals && hiddenPair) continue;
    rows.push({
      id: l.id,
      txnNo: l.txnNo,
      txnDate: l.txnDate,
      txnType: l.txnType,
      description: l.description,
      debit: dec(l.debit).toFixed(2),
      credit: dec(l.credit).toFixed(2),
      balance: running.toFixed(2),
      sourceType: l.sourceType,
      sourceId: l.sourceId,
      isActive: l.isActive,
      isReversal: l.txnType === "REVERSAL",
    });
  }
  return {
    opening: opening.toFixed(2),
    rows,
    totalDebit: totalDebit.toFixed(2),
    totalCredit: totalCredit.toFixed(2),
    closing: running.toFixed(2),
  };
}
