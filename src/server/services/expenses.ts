import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { PaymentMethod, Prisma } from "@prisma/client";
import { z } from "zod";
import { money } from "@/lib/calc";
import { prisma, transaction, type Db } from "@/lib/db";
import { parseDate } from "@/lib/dates";
import { forbidden, invalid, notFound } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import type { Actor } from "./types";

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || "./storage/uploads");
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "application/pdf": ".pdf" };

export const expenseSchema = z.object({
  expenseDate: z.string().min(1, "Date is required"),
  categoryId: z.string().min(1, "Select a category"),
  description: z.string().trim().min(1, "Description is required").max(300),
  amount: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).replace(/,/g, "").trim())
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v) && Number(v) > 0, "Enter an amount greater than zero"),
  method: z.enum(["CASH", "BANK", "JAZZCASH", "EASYPAISA", "OTHER"]).default("CASH"),
  notes: z.string().trim().max(500).optional().default(""),
});
export type ExpenseInput = z.input<typeof expenseSchema>;

function sniff(buf: Buffer): string | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  return null;
}

/** Validate type by magic bytes (not the client-sent MIME), size, and store outside the web root. */
async function storeAttachment(file: File | null | undefined) {
  if (!file || file.size === 0) return null;
  if (file.size > MAX_BYTES) throw invalid("Attachment must be 5 MB or smaller.", { attachment: "Too large" });
  const buf = Buffer.from(await file.arrayBuffer());
  const type = sniff(buf);
  if (!type) throw invalid("Only JPG, PNG or PDF receipts are allowed.", { attachment: "Unsupported type" });
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const name = `${randomUUID()}${ALLOWED[type]}`;
  await fs.writeFile(path.join(UPLOAD_DIR, name), buf);
  return { path: name, name: path.basename(file.name).slice(0, 200) };
}

export async function createExpense(actor: Actor, raw: ExpenseInput, file?: File | null) {
  if (!actor.permissions.has(PERMISSIONS.EXPENSES_MANAGE)) throw forbidden();
  const i = expenseSchema.parse(raw);
  const att = await storeAttachment(file);
  return transaction(async (tx) => {
    const e = await tx.expense.create({
      data: {
        expenseDate: parseDate(i.expenseDate),
        categoryId: i.categoryId,
        description: i.description,
        amount: money(i.amount).toFixed(2),
        method: i.method as PaymentMethod,
        notes: i.notes || null,
        attachmentPath: att?.path ?? null,
        attachmentName: att?.name ?? null,
        createdBy: actor.id,
      },
    });
    await audit(actor.id, "CREATE", "Expense", e.id, { newValues: e, ip: actor.ip }, tx);
    return e;
  });
}

export async function voidExpense(actor: Actor, id: string, reason: string) {
  if (!actor.permissions.has(PERMISSIONS.EXPENSES_MANAGE)) throw forbidden();
  if (!reason?.trim()) throw invalid("A reason is required.", { reason: "Required" });
  return transaction(async (tx) => {
    const e = await tx.expense.findUnique({ where: { id } });
    if (!e || e.voidedAt) throw notFound("Expense");
    await tx.expense.update({ where: { id }, data: { voidedAt: new Date(), voidedBy: actor.id, voidReason: reason } });
    await audit(actor.id, "VOID", "Expense", id, { oldValues: e, reason, ip: actor.ip }, tx);
  });
}

export async function listExpenses(f: { from?: Date; to?: Date; categoryId?: string } = {}, db: Db = prisma) {
  const where: Prisma.ExpenseWhereInput = { voidedAt: null };
  if (f.from || f.to) where.expenseDate = { gte: f.from, lte: f.to };
  if (f.categoryId) where.categoryId = f.categoryId;
  return db.expense.findMany({ where, include: { category: true }, orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }], take: 1000 });
}

export async function readAttachment(id: string) {
  const e = await prisma.expense.findUnique({ where: { id } });
  if (!e?.attachmentPath) throw notFound("Attachment");
  const safe = path.basename(e.attachmentPath);
  const buf = await fs.readFile(path.join(UPLOAD_DIR, safe));
  const ext = path.extname(safe);
  const type = ext === ".pdf" ? "application/pdf" : ext === ".png" ? "image/png" : "image/jpeg";
  return { buf, type, name: e.attachmentName ?? safe };
}

export async function listCategories(db: Db = prisma) {
  return db.expenseCategory.findMany({ where: { isActive: true }, orderBy: { nameEn: "asc" } });
}
