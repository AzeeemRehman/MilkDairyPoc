"use server";
import { revalidatePath } from "next/cache";
import type { SupplyType } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { currentActor } from "@/lib/actor";
import { dec } from "@/lib/calc";
import { parseDate } from "@/lib/dates";
import { toActionResult, type ActionResult } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/permissions";
import {
  bulkCreate,
  createEntry,
  getDefaults,
  previousEntry,
  updateEntry,
  voidEntry,
  type BulkRowResult,
  type EntryInput,
} from "@/server/services/milkEntries";
import { prisma } from "@/lib/db";

export interface EntryContext {
  defaults: Awaited<ReturnType<typeof getDefaults>>;
  existingId: string | null;
  previous: { date: string; morning: SessionVals | null; evening: SessionVals | null } | null;
}
interface SessionVals {
  maan: string;
  kg: string;
  ratePerMaan: string;
  ratePerKg: string;
}

/** Defaults, duplicate check and the previous day's values for the entry form. */
export async function entryContextAction(customerId: string, date: string, supplyType: SupplyType): Promise<EntryContext | null> {
  await requireUser(PERMISSIONS.MILK_ENTRY);
  if (!customerId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const d = parseDate(date);
  const [defaults, existing, prev] = await Promise.all([
    getDefaults(customerId, d, supplyType),
    prisma.milkEntry.findFirst({ where: { customerId, entryDate: d, supplyType, voidedAt: null }, select: { id: true } }),
    previousEntry(customerId, supplyType, d),
  ]);
  const pick = (s: "MORNING" | "EVENING") => {
    const x = prev?.sessions.find((y) => y.session === s);
    return x ? { maan: dec(x.maan).toString(), kg: dec(x.kg).toString(), ratePerMaan: dec(x.ratePerMaan).toString(), ratePerKg: dec(x.ratePerKg).toString() } : null;
  };
  return {
    defaults,
    existingId: existing?.id ?? null,
    previous: prev ? { date: prev.entryDate.toISOString().slice(0, 10), morning: pick("MORNING"), evening: pick("EVENING") } : null,
  };
}

export async function saveEntryAction(input: EntryInput, id?: string, reason?: string): Promise<ActionResult<{ id: string; total: string }>> {
  try {
    const actor = await currentActor();
    const e = id ? await updateEntry(actor, id, input, reason ?? "") : await createEntry(actor, input);
    revalidatePath("/entries");
    revalidatePath("/");
    return { ok: true, message: id ? "Entry updated." : "Entry saved.", data: { id: e.id, total: dec(e.totalAmount).toFixed(2) } };
  } catch (e) {
    return toActionResult(e) as ActionResult<{ id: string; total: string }>;
  }
}

export async function voidEntryAction(id: string, reason: string): Promise<ActionResult> {
  try {
    await voidEntry(await currentActor(), id, reason);
    revalidatePath("/entries");
    return { ok: true, message: "Entry voided." };
  } catch (e) {
    return toActionResult(e);
  }
}

export async function bulkSaveAction(rows: EntryInput[]): Promise<ActionResult<{ saved: number; results: BulkRowResult[] }>> {
  try {
    const r = await bulkCreate(await currentActor(), rows);
    revalidatePath("/entries");
    return r.saved
      ? { ok: true, message: `Saved ${r.saved} entries.`, data: r }
      : { ok: false, message: "Nothing was saved. Fix the rows marked below and try again.", data: r };
  } catch (e) {
    return toActionResult(e) as ActionResult<{ saved: number; results: BulkRowResult[] }>;
  }
}
