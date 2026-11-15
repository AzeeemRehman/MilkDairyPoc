import type { CustomerType, MilkSession, Prisma, SupplyType } from "@prisma/client";
import { z } from "zod";
import { dec, money, ratePerKgFromMaan } from "@/lib/calc";
import { prisma, transaction, type Db } from "@/lib/db";
import { addDays, parseDate, today } from "@/lib/dates";
import { conflict, forbidden, invalid, notFound } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { balances, postSigned, reverseSource } from "./ledger";
import { assertPeriodOpen } from "./periods";
import { reallocate } from "./payments";
import type { Actor } from "./types";

const decimalStr = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).replace(/,/g, "").trim())
  .refine((v) => v === "" || /^-?\d+(\.\d+)?$/.test(v), "Must be a number");

export const customerSchema = z.object({
  code: z.string().trim().max(30).optional().default(""),
  name: z.string().trim().min(1, "Name is required").max(120),
  nameUr: z.string().trim().max(120).optional().default(""),
  businessName: z.string().trim().max(160).optional().default(""),
  contactPerson: z.string().trim().max(120).optional().default(""),
  mobile: z.string().trim().max(30).optional().default(""),
  whatsapp: z.string().trim().max(30).optional().default(""),
  address: z.string().trim().max(300).optional().default(""),
  city: z.string().trim().max(80).optional().default(""),
  customerType: z.enum(["BANDHI", "MANDI", "BOTH"]),
  openingBalance: decimalStr.optional().default("0"),
  openingBalanceDate: z.string().optional().default(""),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  notes: z.string().trim().max(1000).optional().default(""),
});
export type CustomerInput = z.input<typeof customerSchema>;

const nz = (s: string) => (s === "" ? null : s);

async function nextCustomerCode(db: Db) {
  const count = await db.customer.count();
  for (let n = count + 1; ; n++) {
    const code = `C${String(n).padStart(4, "0")}`;
    if (!(await db.customer.findUnique({ where: { code } }))) return code;
  }
}

export async function createCustomer(actor: Actor, raw: CustomerInput) {
  if (!actor.permissions.has(PERMISSIONS.CUSTOMERS_EDIT)) throw forbidden();
  const i = customerSchema.parse(raw);
  const ob = money(i.openingBalance || 0);
  const obDate = i.openingBalanceDate ? parseDate(i.openingBalanceDate) : today();
  return transaction(async (tx) => {
    const code = i.code || (await nextCustomerCode(tx));
    if (await tx.customer.findUnique({ where: { code } })) throw conflict(`Customer code ${code} is already used.`);
    if (!ob.isZero()) await assertPeriodOpen(tx, obDate);
    const c = await tx.customer.create({
      data: {
        code,
        name: i.name,
        nameUr: nz(i.nameUr),
        businessName: nz(i.businessName),
        contactPerson: nz(i.contactPerson),
        mobile: nz(i.mobile),
        whatsapp: nz(i.whatsapp),
        address: nz(i.address),
        city: nz(i.city),
        customerType: i.customerType as CustomerType,
        openingBalance: ob.toFixed(2),
        openingBalanceDate: obDate,
        status: i.status,
        notes: nz(i.notes),
        createdBy: actor.id,
        updatedBy: actor.id,
      },
    });
    await postSigned(tx, {
      customerId: c.id,
      txnDate: obDate,
      txnType: "OPENING",
      description: "Opening balance",
      amount: ob,
      sourceType: "OPENING_BALANCE",
      sourceId: c.id,
      userId: actor.id,
    });
    await audit(actor.id, "CREATE", "Customer", c.id, { newValues: c, ip: actor.ip }, tx);
    return c;
  });
}

export async function updateCustomer(actor: Actor, id: string, raw: CustomerInput, reason?: string) {
  if (!actor.permissions.has(PERMISSIONS.CUSTOMERS_EDIT)) throw forbidden();
  const i = customerSchema.parse(raw);
  return transaction(async (tx) => {
    const old = await tx.customer.findUnique({ where: { id } });
    if (!old) throw notFound("Customer");
    const ob = money(i.openingBalance || 0);
    const obDate = i.openingBalanceDate ? parseDate(i.openingBalanceDate) : old.openingBalanceDate ?? today();
    const obChanged = !dec(old.openingBalance).eq(ob) || old.openingBalanceDate?.getTime() !== obDate.getTime();
    if (obChanged) {
      // Opening balance is financial: needs accountant rights and posts reversal + repost.
      if (!actor.permissions.has(PERMISSIONS.ADJUSTMENTS_MANAGE)) throw forbidden("Only an accountant or admin can change the opening balance.");
      if (old.openingBalanceDate) await assertPeriodOpen(tx, old.openingBalanceDate);
      await assertPeriodOpen(tx, obDate);
    }
    const c = await tx.customer.update({
      where: { id },
      data: {
        code: i.code || old.code,
        name: i.name,
        nameUr: nz(i.nameUr),
        businessName: nz(i.businessName),
        contactPerson: nz(i.contactPerson),
        mobile: nz(i.mobile),
        whatsapp: nz(i.whatsapp),
        address: nz(i.address),
        city: nz(i.city),
        customerType: i.customerType as CustomerType,
        openingBalance: ob.toFixed(2),
        openingBalanceDate: obDate,
        status: i.status,
        notes: nz(i.notes),
        updatedBy: actor.id,
      },
    });
    if (obChanged) {
      await reverseSource(tx, "OPENING_BALANCE", id, actor.id, reason || "Opening balance changed");
      await postSigned(tx, {
        customerId: id,
        txnDate: obDate,
        txnType: "OPENING",
        description: "Opening balance",
        amount: ob,
        sourceType: "OPENING_BALANCE",
        sourceId: id,
        userId: actor.id,
      });
      await reallocate(tx, id);
    }
    await audit(actor.id, "UPDATE", "Customer", id, { oldValues: old, newValues: c, reason, ip: actor.ip }, tx);
    return c;
  });
}

export interface CustomerFilter {
  q?: string;
  city?: string;
  type?: string;
  status?: string;
}

export async function listCustomers(f: CustomerFilter = {}, db: Db = prisma) {
  const where: Prisma.CustomerWhereInput = {};
  if (f.q) {
    where.OR = [
      { name: { contains: f.q, mode: "insensitive" } },
      { code: { contains: f.q, mode: "insensitive" } },
      { businessName: { contains: f.q, mode: "insensitive" } },
      { mobile: { contains: f.q } },
    ];
  }
  if (f.city) where.city = { equals: f.city, mode: "insensitive" };
  if (f.type) where.customerType = f.type as CustomerType;
  if (f.status) where.status = f.status as "ACTIVE" | "INACTIVE";
  const [customers, bal] = await Promise.all([db.customer.findMany({ where, orderBy: { name: "asc" } }), balances(db)]);
  return customers.map((c) => ({ ...c, balance: (bal.get(c.id) ?? dec(0)).toFixed(2) }));
}

export async function searchCustomers(q: string, db: Db = prisma) {
  return db.customer.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }],
    },
    select: { id: true, code: true, name: true, customerType: true, city: true },
    orderBy: { name: "asc" },
    take: 20,
  });
}

// ---------------------------------------------------------------------------
// Rate history
// ---------------------------------------------------------------------------

export const rateSchema = z.object({
  supplyType: z.enum(["BANDHI", "MANDI"]),
  session: z.enum(["MORNING", "EVENING"]),
  defaultMaan: decimalStr.optional().default("0"),
  defaultKg: decimalStr.optional().default("0"),
  ratePerMaan: decimalStr.refine((v) => v !== "", "Required"),
  ratePerKg: decimalStr.optional().default(""),
  effectiveFrom: z.string().min(1, "Required"),
});
export type RateInput = z.input<typeof rateSchema>;

/** Adds a new rate row effective from a date; the previous open-ended row is closed the day before. */
export async function setRate(actor: Actor, customerId: string, raw: RateInput) {
  if (!actor.permissions.has(PERMISSIONS.RATES_EDIT)) throw forbidden();
  const i = rateSchema.parse(raw);
  const from = parseDate(i.effectiveFrom);
  const rpm = dec(i.ratePerMaan);
  const rpk = i.ratePerKg === "" ? ratePerKgFromMaan(rpm) : dec(i.ratePerKg);
  if (rpm.isNeg() || rpk.isNeg() || dec(i.defaultMaan).isNeg() || dec(i.defaultKg).isNeg()) throw invalid("Values cannot be negative.");
  return transaction(async (tx) => {
    const key = { customerId, supplyType: i.supplyType as SupplyType, session: i.session as MilkSession };
    if (await tx.customerRate.findFirst({ where: { ...key, effectiveFrom: from } }))
      throw conflict("A rate for this supply type and session already starts on that date.");
    const prev = await tx.customerRate.findFirst({ where: { ...key, effectiveFrom: { lt: from } }, orderBy: { effectiveFrom: "desc" } });
    const next = await tx.customerRate.findFirst({ where: { ...key, effectiveFrom: { gt: from } }, orderBy: { effectiveFrom: "asc" } });
    if (prev && (!prev.effectiveTo || prev.effectiveTo >= from)) {
      await tx.customerRate.update({ where: { id: prev.id }, data: { effectiveTo: addDays(from, -1) } });
    }
    const rate = await tx.customerRate.create({
      data: {
        ...key,
        defaultMaan: dec(i.defaultMaan).toFixed(3),
        defaultKg: dec(i.defaultKg).toFixed(3),
        ratePerMaan: rpm.toFixed(4),
        ratePerKg: rpk.toFixed(4),
        effectiveFrom: from,
        effectiveTo: next ? addDays(next.effectiveFrom, -1) : null,
        createdBy: actor.id,
      },
    });
    await audit(actor.id, "RATE_SET", "Customer", customerId, { oldValues: prev, newValues: rate, ip: actor.ip }, tx);
    return rate;
  });
}

/** Rates valid on a date, keyed by `${supplyType}:${session}`. */
export async function ratesOn(db: Db, customerId: string, date: Date) {
  const rows = await db.customerRate.findMany({
    where: { customerId, effectiveFrom: { lte: date }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }] },
  });
  return new Map(rows.map((r) => [`${r.supplyType}:${r.session}`, r]));
}

export async function getCustomer(id: string, db: Db = prisma) {
  const c = await db.customer.findUnique({
    where: { id },
    include: { rates: { orderBy: [{ supplyType: "asc" }, { session: "asc" }, { effectiveFrom: "desc" }] } },
  });
  if (!c) throw notFound("Customer");
  return c;
}

export async function cities(db: Db = prisma) {
  const rows = await db.customer.findMany({ where: { city: { not: null } }, select: { city: true }, distinct: ["city"], orderBy: { city: "asc" } });
  return rows.map((r) => r.city!).filter(Boolean);
}
