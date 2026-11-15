import { Prisma, PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = prisma;

export type Tx = Prisma.TransactionClient;
export type Db = PrismaClient | Tx;

/** Run fn in a serializable-safe transaction (one DB transaction per business operation). */
export function transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn, { timeout: 60000, maxWait: 10000 });
}

/** Next number of a gap-free sequence, inside the caller's transaction. */
export async function nextNumber(tx: Tx, key: string): Promise<number> {
  const row = await tx.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return row.value;
}

export async function nextDocNo(tx: Tx, prefix: string, year: number): Promise<string> {
  const n = await nextNumber(tx, `${prefix}-${year}`);
  return `${prefix}-${year}-${String(n).padStart(6, "0")}`;
}
