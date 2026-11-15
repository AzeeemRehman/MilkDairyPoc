import type { Prisma } from "@prisma/client";
import { prisma, type Db } from "./db";

/** JSON-safe copy (Decimals and Dates become strings). */
export function snapshot(v: unknown): Prisma.InputJsonValue | undefined {
  if (v === undefined || v === null) return undefined;
  return JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
}

export async function audit(
  userId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  opts: { oldValues?: unknown; newValues?: unknown; reason?: string | null; ip?: string | null } = {},
  db: Db = prisma,
) {
  await db.auditLog.create({
    data: {
      userId,
      action,
      entityType,
      entityId,
      oldValues: snapshot(opts.oldValues),
      newValues: snapshot(opts.newValues),
      reason: opts.reason ?? null,
      ip: opts.ip ?? null,
    },
  });
}
