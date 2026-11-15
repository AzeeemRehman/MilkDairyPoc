/**
 * Daily milk entries (Bandhi / Mandi). Each saved entry posts exactly one ledger line;
 * edits post reversal + repost; voids are soft deletes + reversal (PLANNING.md §5.2).
 */
import type { MilkSession, Prisma, SupplyType } from "@prisma/client";
import { z } from "zod";
import { dailyAmount, dec, ratePerKgFromMaan, sessionAmount } from "@/lib/calc";
import { prisma, transaction, type Db, type Tx } from "@/lib/db";
import { addDays, isoDate, parseDate, periodOf, today } from "@/lib/dates";
import { AppError, conflict, forbidden, invalid, notFound } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { post, reverseSource } from "./ledger";
import { assertPeriodOpen } from "./periods";
import { ratesOn } from "./customers";
import { reallocate } from "./payments";
import type { Actor } from "./types";

const num = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).replace(/,/g, "").trim() || "0")
  .refine((v) => /^\d+(\.\d+)?$/.test(v), "Must be a non-negative number");

/** Optional rate: blank stays blank so Rate/KG can be derived from Rate/Maan (÷40). */
const optionalRate = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).replace(/,/g, "").trim())
  .refine((v) => v === "" || /^\d+(\.\d+)?$/.test(v), "Must be a non-negative number");

const sessionSchema = z.object({
  maan: num.default("0"),
  kg: num.default("0"),
  ratePerMaan: num.default("0"),
  ratePerKg: optionalRate.default(""),
});

export const entrySchema = z.object({
  customerId: z.string().min(1, "Select a customer"),
  entryDate: z.string().min(1, "Date is required"),
  supplyType: z.enum(["BANDHI", "MANDI"]),
  noSupply: z.boolean().optional().default(false),
  notes: z.string().trim().max(500).optional().default(""),
  morning: sessionSchema.optional(),
  evening: sessionSchema.optional(),
});
export type EntryInput = z.input<typeof entrySchema>;
type ParsedEntry = z.output<typeof entrySchema>;

export interface SessionDefaults {
  maan: string;
  kg: string;
  ratePerMaan: string;
  ratePerKg: string;
}

/** Defaults for the entry form: Bandhi quantities + rates, Mandi rates (if configured). */
export async function getDefaults(customerId: string, date: Date, supplyType: SupplyType, db: Db = prisma) {
  const rates = await ratesOn(db, customerId, date);
  const out: Partial<Record<MilkSession, SessionDefaults>> = {};
  for (const s of ["MORNING", "EVENING"] as MilkSession[]) {
    const r = rates.get(`${supplyType}:${s}`);
    if (r)
      out[s] = {
        maan: supplyType === "BANDHI" ? dec(r.defaultMaan).toString() : "0",
        kg: supplyType === "BANDHI" ? dec(r.defaultKg).toString() : "0",
        ratePerMaan: dec(r.ratePerMaan).toString(),
        ratePerKg: dec(r.ratePerKg).toString(),
      };
  }
  return out;
}

interface BuiltSession {
  session: MilkSession;
  maan: string;
  kg: string;
  ratePerMaan: string;
  ratePerKg: string;
  amount: string;
  rateOverridden: boolean;
}

/** Validate, apply permissions and compute amounts (server is authoritative). */
async function build(db: Db, actor: Actor, i: ParsedEntry) {
  const date = parseDate(i.entryDate);
  const customer = await db.customer.findUnique({ where: { id: i.customerId } });
  if (!customer) throw notFound("Customer");
  if (customer.status !== "ACTIVE") throw invalid(`${customer.name} is inactive.`);
  if (customer.customerType !== "BOTH" && customer.customerType !== i.supplyType)
    throw invalid(`${customer.name} is a ${customer.customerType} customer.`);

  const defaults = await getDefaults(i.customerId, date, i.supplyType, db);
  if (i.supplyType === "BANDHI" && !defaults.MORNING && !defaults.EVENING)
    throw invalid(`No Bandhi rate is set for ${customer.name} on ${isoDate(date)}. Add one on the customer's Rates tab.`);

  const sessions: BuiltSession[] = [];
  for (const [key, s] of [["MORNING", i.morning], ["EVENING", i.evening]] as const) {
    if (!s && !i.noSupply) continue;
    const d = defaults[key];
    const v = i.noSupply
      ? { maan: "0", kg: "0", ratePerMaan: d?.ratePerMaan ?? "0", ratePerKg: d?.ratePerKg ?? "0" }
      : { ...s!, ratePerKg: s!.ratePerKg === "" ? ratePerKgFromMaan(s!.ratePerMaan).toString() : s!.ratePerKg };
    if (!s && i.noSupply && !d) continue;

    const rateOverridden = !!d && (!dec(v.ratePerMaan).eq(dec(d.ratePerMaan)) || !dec(v.ratePerKg).eq(dec(d.ratePerKg)));
    if (i.supplyType === "BANDHI" && !i.noSupply) {
      const qtyChanged = !d || !dec(v.maan).eq(dec(d.maan)) || !dec(v.kg).eq(dec(d.kg));
      if (qtyChanged && !actor.permissions.has(PERMISSIONS.MILK_OVERRIDE_QTY))
        throw forbidden("You are not allowed to change Bandhi quantities.");
      if (rateOverridden && !actor.permissions.has(PERMISSIONS.MILK_OVERRIDE_RATE))
        throw forbidden("You are not allowed to override Bandhi rates.");
    }
    if (i.supplyType === "MANDI" && (dec(v.maan).gt(0) || dec(v.kg).gt(0)) && dec(v.ratePerMaan).isZero() && dec(v.ratePerKg).isZero())
      throw invalid(`Enter the ${key.toLowerCase()} Mandi rate.`, { [`${key.toLowerCase()}.ratePerMaan`]: "Rate required" });

    sessions.push({
      session: key,
      maan: dec(v.maan).toFixed(3),
      kg: dec(v.kg).toFixed(3),
      ratePerMaan: dec(v.ratePerMaan).toFixed(4),
      ratePerKg: dec(v.ratePerKg).toFixed(4),
      amount: sessionAmount(v).toFixed(2),
      rateOverridden,
    });
  }
  if (!sessions.length && !i.noSupply) throw invalid("Enter at least one session.");
  const total = dailyAmount(
    sessions.find((s) => s.session === "MORNING"),
    sessions.find((s) => s.session === "EVENING"),
  );
  return { date, customer, sessions, total };
}

function ledgerDescription(supplyType: SupplyType, date: Date, sessions: BuiltSession[]) {
  const parts = sessions.map((s) => `${s.session === "MORNING" ? "M" : "E"} ${dec(s.maan)}-${dec(s.kg)}`);
  return `${supplyType === "BANDHI" ? "Bandhi" : "Mandi"} milk ${isoDate(date)} (${parts.join(", ")})`;
}

async function insertEntry(tx: Tx, actor: Actor, i: ParsedEntry) {
  const b = await build(tx, actor, i);
  await assertPeriodOpen(tx, b.date);
  const dup = await tx.milkEntry.findFirst({
    where: { customerId: i.customerId, entryDate: b.date, supplyType: i.supplyType, voidedAt: null },
  });
  if (dup) throw conflict(`${b.customer.name} already has a ${i.supplyType} entry for ${isoDate(b.date)}. Edit that entry instead.`);
  const entry = await tx.milkEntry.create({
    data: {
      customerId: i.customerId,
      entryDate: b.date,
      supplyType: i.supplyType,
      period: periodOf(b.date),
      totalAmount: b.total.toFixed(2),
      noSupply: i.noSupply,
      notes: i.notes || null,
      createdBy: actor.id,
      updatedBy: actor.id,
      sessions: { create: b.sessions },
    },
    include: { sessions: true },
  });
  if (b.total.gt(0)) {
    await post(tx, {
      customerId: i.customerId,
      txnDate: b.date,
      txnType: i.supplyType === "BANDHI" ? "BANDHI_CHARGE" : "MANDI_CHARGE",
      description: ledgerDescription(i.supplyType, b.date, b.sessions),
      debit: b.total,
      sourceType: "MILK_ENTRY",
      sourceId: entry.id,
      userId: actor.id,
    });
  }
  await audit(actor.id, "CREATE", "MilkEntry", entry.id, { newValues: entry, ip: actor.ip }, tx);
  return entry;
}

export async function createEntry(actor: Actor, raw: EntryInput) {
  if (!actor.permissions.has(PERMISSIONS.MILK_ENTRY)) throw forbidden();
  const i = entrySchema.parse(raw);
  return transaction(async (tx) => {
    const e = await insertEntry(tx, actor, i);
    await reallocate(tx, i.customerId);
    return e;
  });
}

function assertCanEdit(actor: Actor, entryDate: Date) {
  if (!actor.permissions.has(PERMISSIONS.MILK_ENTRY)) throw forbidden();
  if (!actor.permissions.has(PERMISSIONS.MILK_EDIT_PAST) && entryDate.getTime() !== today().getTime())
    throw forbidden("You can only edit or void today's entries.");
}

export async function updateEntry(actor: Actor, id: string, raw: EntryInput, reason: string) {
  const i = entrySchema.parse(raw);
  if (!reason?.trim()) throw invalid("A reason is required when editing an entry.", { reason: "Required" });
  return transaction(async (tx) => {
    const old = await tx.milkEntry.findUnique({ where: { id }, include: { sessions: true } });
    if (!old || old.voidedAt) throw notFound("Milk entry");
    assertCanEdit(actor, old.entryDate);
    if (old.customerId !== i.customerId || isoDate(old.entryDate) !== i.entryDate || old.supplyType !== i.supplyType)
      throw invalid("Customer, date and supply type cannot change. Void the entry and create a new one.");
    await assertPeriodOpen(tx, old.entryDate);
    const b = await build(tx, actor, i);
    await tx.milkEntrySession.deleteMany({ where: { milkEntryId: id } });
    const entry = await tx.milkEntry.update({
      where: { id },
      data: {
        totalAmount: b.total.toFixed(2),
        noSupply: i.noSupply,
        notes: i.notes || null,
        updatedBy: actor.id,
        sessions: { create: b.sessions },
      },
      include: { sessions: true },
    });
    await reverseSource(tx, "MILK_ENTRY", id, actor.id, reason);
    if (b.total.gt(0)) {
      await post(tx, {
        customerId: entry.customerId,
        txnDate: entry.entryDate,
        txnType: entry.supplyType === "BANDHI" ? "BANDHI_CHARGE" : "MANDI_CHARGE",
        description: ledgerDescription(entry.supplyType, entry.entryDate, b.sessions),
        debit: b.total,
        sourceType: "MILK_ENTRY",
        sourceId: id,
        userId: actor.id,
      });
    }
    await audit(actor.id, "UPDATE", "MilkEntry", id, { oldValues: old, newValues: entry, reason, ip: actor.ip }, tx);
    await reallocate(tx, entry.customerId);
    return entry;
  });
}

export async function voidEntry(actor: Actor, id: string, reason: string) {
  if (!reason?.trim()) throw invalid("A reason is required.", { reason: "Required" });
  return transaction(async (tx) => {
    const old = await tx.milkEntry.findUnique({ where: { id } });
    if (!old || old.voidedAt) throw notFound("Milk entry");
    assertCanEdit(actor, old.entryDate);
    await assertPeriodOpen(tx, old.entryDate);
    await tx.milkEntry.update({ where: { id }, data: { voidedAt: new Date(), voidedBy: actor.id, voidReason: reason } });
    await reverseSource(tx, "MILK_ENTRY", id, actor.id, `Voided: ${reason}`);
    await audit(actor.id, "VOID", "MilkEntry", id, { oldValues: old, reason, ip: actor.ip }, tx);
    await reallocate(tx, old.customerId);
  });
}

/** The most recent earlier entry of the same customer/type, used by "Copy previous day". */
export async function previousEntry(customerId: string, supplyType: SupplyType, before: Date, db: Db = prisma) {
  return db.milkEntry.findFirst({
    where: { customerId, supplyType, voidedAt: null, entryDate: { lt: before } },
    orderBy: { entryDate: "desc" },
    include: { sessions: true },
  });
}

export interface BulkRowResult {
  customerId: string;
  ok: boolean;
  message?: string;
}

/**
 * Bulk entry: all-or-nothing. Every row is validated first; if any row fails, nothing is
 * saved and the per-row error report is returned.
 */
export async function bulkCreate(actor: Actor, rows: EntryInput[]): Promise<{ saved: number; results: BulkRowResult[] }> {
  if (!actor.permissions.has(PERMISSIONS.MILK_ENTRY)) throw forbidden();
  const parsed = rows.map((r) => entrySchema.safeParse(r));
  const results: BulkRowResult[] = parsed.map((p, idx) => ({
    customerId: String(rows[idx].customerId),
    ok: p.success,
    message: p.success ? undefined : p.error.issues.map((x) => x.message).join("; "),
  }));
  if (results.some((r) => !r.ok)) return { saved: 0, results };

  class RollbackForReport extends Error {}
  try {
    const saved = await transaction(async (tx) => {
      let failed = false;
      for (const [idx, p] of parsed.entries()) {
        const i = (p as { data: ParsedEntry }).data;
        try {
          await tx.$executeRawUnsafe(`SAVEPOINT row_${idx}`);
          await insertEntry(tx, actor, i);
          await tx.$executeRawUnsafe(`RELEASE SAVEPOINT row_${idx}`);
          results[idx] = { customerId: i.customerId, ok: true };
        } catch (e) {
          await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT row_${idx}`);
          failed = true;
          results[idx] = { customerId: i.customerId, ok: false, message: e instanceof AppError ? e.message : String((e as Error).message ?? e) };
        }
      }
      if (failed) throw new RollbackForReport();
      const customerIds = [...new Set(parsed.map((p) => (p as { data: ParsedEntry }).data.customerId))];
      for (const c of customerIds) await reallocate(tx, c);
      return parsed.length;
    });
    return { saved, results };
  } catch (e) {
    if (e instanceof RollbackForReport) return { saved: 0, results: results.map((r) => (r.ok ? { ...r, message: "Not saved (batch rolled back)" , ok: false} : r)) };
    throw e;
  }
}

/** Bulk grid rows: all active Bandhi customers with defaults for a date. */
export async function bulkGrid(date: Date, db: Db = prisma) {
  const customers = await db.customer.findMany({
    where: { status: "ACTIVE", customerType: { in: ["BANDHI", "BOTH"] } },
    orderBy: { name: "asc" },
  });
  const existing = await db.milkEntry.findMany({
    where: { entryDate: date, supplyType: "BANDHI", voidedAt: null },
    select: { customerId: true, id: true, totalAmount: true },
  });
  const have = new Map(existing.map((e) => [e.customerId, e]));
  const rows = [];
  for (const c of customers) {
    const d = await getDefaults(c.id, date, "BANDHI", db);
    rows.push({
      customerId: c.id,
      code: c.code,
      name: c.name,
      defaults: d,
      existingId: have.get(c.id)?.id ?? null,
      existingAmount: have.get(c.id) ? dec(have.get(c.id)!.totalAmount).toFixed(2) : null,
    });
  }
  return rows;
}

export interface EntryFilter {
  date?: Date;
  from?: Date;
  to?: Date;
  customerId?: string;
  supplyType?: SupplyType;
  includeVoided?: boolean;
}

export async function listEntries(f: EntryFilter, db: Db = prisma) {
  const where: Prisma.MilkEntryWhereInput = {};
  if (f.date) where.entryDate = f.date;
  else if (f.from || f.to) where.entryDate = { gte: f.from, lte: f.to };
  if (f.customerId) where.customerId = f.customerId;
  if (f.supplyType) where.supplyType = f.supplyType;
  if (!f.includeVoided) where.voidedAt = null;
  return db.milkEntry.findMany({
    where,
    include: { sessions: true, customer: { select: { id: true, name: true, code: true } } },
    orderBy: [{ entryDate: "asc" }, { customer: { name: "asc" } }],
  });
}

export async function getEntry(id: string, db: Db = prisma) {
  const e = await db.milkEntry.findUnique({ where: { id }, include: { sessions: true, customer: true } });
  if (!e) throw notFound("Milk entry");
  return e;
}

export { addDays };
