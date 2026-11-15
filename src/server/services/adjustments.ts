import type { AdjustmentType, TxnType } from "@prisma/client";
import { z } from "zod";
import { money } from "@/lib/calc";
import { prisma, transaction, type Db } from "@/lib/db";
import { parseDate } from "@/lib/dates";
import { forbidden, invalid, notFound } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { post, reverseSource } from "./ledger";
import { assertPeriodOpen } from "./periods";
import { reallocate } from "./payments";
import type { Actor } from "./types";

/** Debit side increases what the customer owes; credit side reduces it. */
export const ADJUSTMENT_SIDE: Record<AdjustmentType, "DEBIT" | "CREDIT"> = {
  ADDITIONAL_CHARGE: "DEBIT",
  REFUND: "DEBIT",
  DEBIT_ADJ: "DEBIT",
  DISCOUNT: "CREDIT",
  CREDIT_ADJ: "CREDIT",
  CASH_ADJ: "CREDIT",
};

export const ADJUSTMENT_LABEL: Record<AdjustmentType, string> = {
  ADDITIONAL_CHARGE: "Additional charge",
  REFUND: "Refund paid out",
  DEBIT_ADJ: "Debit adjustment",
  DISCOUNT: "Discount",
  CREDIT_ADJ: "Credit adjustment",
  CASH_ADJ: "Cash adjustment",
};

export const adjustmentSchema = z.object({
  customerId: z.string().min(1, "Select a customer"),
  adjDate: z.string().min(1, "Date is required"),
  type: z.enum(["ADDITIONAL_CHARGE", "DISCOUNT", "REFUND", "CASH_ADJ", "DEBIT_ADJ", "CREDIT_ADJ"]),
  amount: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).replace(/,/g, "").trim())
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v) && Number(v) > 0, "Enter an amount greater than zero"),
  reason: z.string().trim().min(1, "A reason is required").max(500),
});
export type AdjustmentInput = z.input<typeof adjustmentSchema>;

export async function createAdjustment(actor: Actor, raw: AdjustmentInput) {
  if (!actor.permissions.has(PERMISSIONS.ADJUSTMENTS_MANAGE)) throw forbidden();
  const i = adjustmentSchema.parse(raw);
  const date = parseDate(i.adjDate);
  return transaction(async (tx) => {
    await assertPeriodOpen(tx, date);
    if (!(await tx.customer.findUnique({ where: { id: i.customerId } }))) throw notFound("Customer");
    const amount = money(i.amount);
    const adj = await tx.adjustment.create({
      data: { customerId: i.customerId, adjDate: date, type: i.type, amount: amount.toFixed(2), reason: i.reason, createdBy: actor.id },
    });
    const side = ADJUSTMENT_SIDE[i.type];
    await post(tx, {
      customerId: i.customerId,
      txnDate: date,
      txnType: i.type as TxnType,
      description: `${ADJUSTMENT_LABEL[i.type]}: ${i.reason}`,
      debit: side === "DEBIT" ? amount : 0,
      credit: side === "CREDIT" ? amount : 0,
      sourceType: "ADJUSTMENT",
      sourceId: adj.id,
      userId: actor.id,
    });
    await reallocate(tx, i.customerId);
    await audit(actor.id, "CREATE", "Adjustment", adj.id, { newValues: adj, ip: actor.ip }, tx);
    return adj;
  });
}

export async function voidAdjustment(actor: Actor, id: string, reason: string) {
  if (!actor.permissions.has(PERMISSIONS.ADJUSTMENTS_MANAGE)) throw forbidden();
  if (!reason?.trim()) throw invalid("A reason is required.", { reason: "Required" });
  return transaction(async (tx) => {
    const a = await tx.adjustment.findUnique({ where: { id } });
    if (!a || a.voidedAt) throw notFound("Adjustment");
    await assertPeriodOpen(tx, a.adjDate);
    await tx.adjustment.update({ where: { id }, data: { voidedAt: new Date(), voidedBy: actor.id, voidReason: reason } });
    await reverseSource(tx, "ADJUSTMENT", id, actor.id, `Voided: ${reason}`);
    await reallocate(tx, a.customerId);
    await audit(actor.id, "VOID", "Adjustment", id, { oldValues: a, reason, ip: actor.ip }, tx);
  });
}

export async function listAdjustments(f: { customerId?: string; from?: Date; to?: Date } = {}, db: Db = prisma) {
  return db.adjustment.findMany({
    where: {
      customerId: f.customerId,
      adjDate: f.from || f.to ? { gte: f.from, lte: f.to } : undefined,
    },
    include: { customer: { select: { id: true, name: true, code: true } } },
    orderBy: [{ adjDate: "desc" }, { createdAt: "desc" }],
    take: 500,
  });
}
