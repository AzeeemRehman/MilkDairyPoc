"use server";
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/actor";
import { toActionResult, type ActionResult } from "@/lib/errors";
import { formObject, str } from "@/lib/form";
import { recordPayment, voidPayment, type PaymentInput } from "@/server/services/payments";
import { createAdjustment, voidAdjustment, type AdjustmentInput } from "@/server/services/adjustments";
import { createExpense, voidExpense, type ExpenseInput } from "@/server/services/expenses";
import { generateStatementTx } from "@/server/services/statements";
import { closePeriod, reopenPeriod } from "@/server/services/periods";

function done(paths: string[], message: string, data?: unknown): ActionResult {
  for (const p of paths) revalidatePath(p);
  return { ok: true, message, data };
}

export async function recordPaymentAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const p = await recordPayment(await currentActor(), formObject(fd) as unknown as PaymentInput);
    return done(["/payments", "/"], `Payment recorded. Receipt ${p.receiptNo}.`, { id: p.id });
  } catch (e) {
    return toActionResult(e);
  }
}

export async function voidPaymentAction(id: string, reason: string): Promise<ActionResult> {
  try {
    await voidPayment(await currentActor(), id, reason);
    return done(["/payments"], "Payment voided.");
  } catch (e) {
    return toActionResult(e);
  }
}

export async function createAdjustmentAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    await createAdjustment(await currentActor(), formObject(fd) as unknown as AdjustmentInput);
    return done(["/adjustments"], "Adjustment posted.");
  } catch (e) {
    return toActionResult(e);
  }
}

export async function voidAdjustmentAction(id: string, reason: string): Promise<ActionResult> {
  try {
    await voidAdjustment(await currentActor(), id, reason);
    return done(["/adjustments"], "Adjustment voided.");
  } catch (e) {
    return toActionResult(e);
  }
}

export async function createExpenseAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const file = fd.get("attachment");
    await createExpense(await currentActor(), formObject(fd) as unknown as ExpenseInput, file instanceof File ? file : null);
    return done(["/expenses", "/"], "Expense saved.");
  } catch (e) {
    return toActionResult(e);
  }
}

export async function voidExpenseAction(id: string, reason: string): Promise<ActionResult> {
  try {
    await voidExpense(await currentActor(), id, reason);
    return done(["/expenses"], "Expense voided.");
  } catch (e) {
    return toActionResult(e);
  }
}

export async function generateStatementAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const st = await generateStatementTx(await currentActor(), str(fd.get("customerId")), str(fd.get("period")));
    return done(["/statements"], `Statement ${st.statementNo} (v${st.version}) generated.`, { id: st.id });
  } catch (e) {
    return toActionResult(e);
  }
}

export async function closePeriodAction(period: string): Promise<ActionResult> {
  try {
    const r = await closePeriod(await currentActor(), period);
    const extra = r.regenerated.length ? ` Later months regenerated: ${r.regenerated.join(", ")}.` : "";
    return done(["/settings/periods", "/statements"], `${period} closed. ${r.statements} statement(s) finalised.${extra}`);
  } catch (e) {
    return toActionResult(e);
  }
}

export async function reopenPeriodAction(period: string, reason: string): Promise<ActionResult> {
  try {
    await reopenPeriod(await currentActor(), period, reason);
    return done(["/settings/periods"], `${period} reopened.`);
  } catch (e) {
    return toActionResult(e);
  }
}
