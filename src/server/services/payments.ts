/** Payments, receipts and FIFO allocation to statements (PLANNING.md §5.4). */
import type { PaymentMethod, Prisma } from "@prisma/client";
import { z } from "zod";
import { allocateFifo, dec, money, sum } from "@/lib/calc";
import { nextDocNo, prisma, transaction, type Db, type Tx } from "@/lib/db";
import { parseDate } from "@/lib/dates";
import { forbidden, invalid, notFound } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { post, reverseSource } from "./ledger";
import { assertPeriodOpen } from "./periods";
import type { Actor } from "./types";

export const paymentSchema = z.object({
  customerId: z.string().min(1, "Select a customer"),
  paymentDate: z.string().min(1, "Date is required"),
  amount: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).replace(/,/g, "").trim())
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v) && Number(v) > 0, "Enter an amount greater than zero"),
  method: z.enum(["CASH", "BANK", "JAZZCASH", "EASYPAISA", "OTHER"]).default("CASH"),
  reference: z.string().trim().max(120).optional().default(""),
  notes: z.string().trim().max(500).optional().default(""),
});
export type PaymentInput = z.input<typeof paymentSchema>;

export async function recordPayment(actor: Actor, raw: PaymentInput) {
  if (!actor.permissions.has(PERMISSIONS.PAYMENTS_MANAGE)) throw forbidden();
  const i = paymentSchema.parse(raw);
  const date = parseDate(i.paymentDate);
  return transaction(async (tx) => {
    await assertPeriodOpen(tx, date);
    const customer = await tx.customer.findUnique({ where: { id: i.customerId } });
    if (!customer) throw notFound("Customer");
    const prefix = (await getSettings(tx)).receiptPrefix || "RC";
    const payment = await tx.payment.create({
      data: {
        receiptNo: await nextDocNo(tx, prefix, date.getUTCFullYear()),
        customerId: i.customerId,
        paymentDate: date,
        amount: money(i.amount).toFixed(2),
        method: i.method as PaymentMethod,
        reference: i.reference || null,
        notes: i.notes || null,
        createdBy: actor.id,
      },
    });
    await post(tx, {
      customerId: i.customerId,
      txnDate: date,
      txnType: "PAYMENT",
      description: `Payment received ${payment.receiptNo} (${i.method}${i.reference ? " " + i.reference : ""})`,
      credit: payment.amount,
      sourceType: "PAYMENT",
      sourceId: payment.id,
      userId: actor.id,
    });
    await reallocate(tx, i.customerId);
    await audit(actor.id, "CREATE", "Payment", payment.id, { newValues: payment, ip: actor.ip }, tx);
    return payment;
  });
}

export async function voidPayment(actor: Actor, id: string, reason: string) {
  if (!actor.permissions.has(PERMISSIONS.PAYMENTS_MANAGE)) throw forbidden();
  if (!reason?.trim()) throw invalid("A reason is required.", { reason: "Required" });
  return transaction(async (tx) => {
    const p = await tx.payment.findUnique({ where: { id } });
    if (!p || p.voidedAt) throw notFound("Payment");
    await assertPeriodOpen(tx, p.paymentDate);
    await tx.payment.update({ where: { id }, data: { voidedAt: new Date(), voidedBy: actor.id, voidReason: reason } });
    await reverseSource(tx, "PAYMENT", id, actor.id, `Voided: ${reason}`);
    await reallocate(tx, p.customerId);
    await audit(actor.id, "VOID", "Payment", id, { oldValues: p, reason, ip: actor.ip }, tx);
  });
}

/**
 * Recompute FIFO allocations for one customer from scratch (deterministic, so voids,
 * edits and new statements are always reflected). Buckets, oldest first:
 *   1. the opening balance (statementId = null), if positive
 *   2. each FINAL statement's own charges for its period (milk + charges − credits)
 * Anything left over is an advance shown as a credit balance.
 */
export async function reallocate(tx: Tx, customerId: string) {
  const customer = await tx.customer.findUniqueOrThrow({ where: { id: customerId } });
  const payments = await tx.payment.findMany({
    where: { customerId, voidedAt: null },
    orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }],
  });
  await tx.paymentAllocation.deleteMany({ where: { payment: { customerId } } });
  const statements = await tx.monthlyStatement.findMany({ where: { customerId, status: "FINAL" }, orderBy: { period: "asc" } });

  const ob = dec(customer.openingBalance);
  const buckets = [
    ...(ob.gt(0) ? [{ id: null as string | null, due: ob }] : []),
    ...statements.map((s) => ({ id: s.id as string | null, due: dec(s.totalMilk).plus(dec(s.additionalCharges)).minus(dec(s.credits)) })),
  ];
  // A negative opening balance is an advance: it pays the oldest buckets first.
  const sources = [
    ...(ob.lt(0) ? [{ id: "__opening_advance__", amount: ob.abs() }] : []),
    ...payments.map((p) => ({ id: p.id, amount: p.amount })),
  ];
  const { allocations } = allocateFifo(sources, buckets);
  const real = allocations.filter((a) => a.paymentId !== "__opening_advance__");
  if (real.length) {
    await tx.paymentAllocation.createMany({
      data: real.map((a) => ({ paymentId: a.paymentId, statementId: a.bucketId, amount: a.amount.toFixed(2) })),
    });
  }
  for (const s of statements) {
    const due = dec(s.totalMilk).plus(dec(s.additionalCharges)).minus(dec(s.credits));
    const paid = sum(allocations.filter((a) => a.bucketId === s.id).map((a) => a.amount));
    const paidStatus = due.lte(0) || paid.gte(due) ? "PAID" : paid.gt(0) ? "PARTIAL" : "UNPAID";
    if (paidStatus !== s.paidStatus) await tx.monthlyStatement.update({ where: { id: s.id }, data: { paidStatus } });
  }
}

export interface PaymentFilter {
  from?: Date;
  to?: Date;
  customerId?: string;
  method?: string;
  includeVoided?: boolean;
}

export async function listPayments(f: PaymentFilter = {}, db: Db = prisma) {
  const where: Prisma.PaymentWhereInput = {};
  if (f.from || f.to) where.paymentDate = { gte: f.from, lte: f.to };
  if (f.customerId) where.customerId = f.customerId;
  if (f.method) where.method = f.method as PaymentMethod;
  if (!f.includeVoided) where.voidedAt = null;
  return db.payment.findMany({
    where,
    include: { customer: { select: { id: true, name: true, code: true } }, allocations: { include: { statement: { select: { period: true, statementNo: true } } } } },
    orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
    take: 500,
  });
}

export async function getPayment(id: string, db: Db = prisma) {
  const p = await db.payment.findUnique({
    where: { id },
    include: { customer: true, allocations: { include: { statement: true } } },
  });
  if (!p) throw notFound("Payment");
  return p;
}
