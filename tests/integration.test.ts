/**
 * Integration tests against a real PostgreSQL database (PLANNING.md §12).
 * Covers: golden statement, ledger reversal on edit/void, duplicate guard, rate history,
 * payments (partial/full/advance) + FIFO, close → carry-forward, reopen → re-close
 * versioning, closed-period guard (service + DB trigger), permissions, bulk entry.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dec } from "@/lib/calc";
import { prisma } from "@/lib/db";
import { parseDate } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { ROLE_MATRIX } from "@/lib/permissions";
import { seed } from "../prisma/seed";
import { createCustomer, setRate } from "@/server/services/customers";
import { bulkCreate, createEntry, updateEntry, voidEntry } from "@/server/services/milkEntries";
import { balance, getLedger } from "@/server/services/ledger";
import { recordPayment, voidPayment } from "@/server/services/payments";
import { createAdjustment } from "@/server/services/adjustments";
import { generateStatementTx, previewStatement } from "@/server/services/statements";
import { closePeriod, reopenPeriod } from "@/server/services/periods";
import { systemActor, type Actor } from "@/server/services/types";

const admin: Actor = systemActor("test-admin", ROLE_MATRIX.ADMIN.permissions);
const accountant: Actor = systemActor("test-accountant", ROLE_MATRIX.ACCOUNTANT.permissions);
const dataEntry: Actor = systemActor("test-data-entry", ROLE_MATRIX.DATA_ENTRY.permissions);
const viewer: Actor = systemActor("test-viewer", ROLE_MATRIX.VIEWER.permissions);

const bandhi = (customerId: string, date: string, extra: Partial<{ maan: string; kg: string; rpm: string }> = {}) => ({
  customerId,
  entryDate: date,
  supplyType: "BANDHI" as const,
  morning: { maan: extra.maan ?? "9", kg: extra.kg ?? "0", ratePerMaan: extra.rpm ?? "8264", ratePerKg: "" },
  evening: { maan: extra.maan ?? "9", kg: extra.kg ?? "0", ratePerMaan: extra.rpm ?? "8264", ratePerKg: "" },
});

const mandi = (customerId: string, date: string, m: [string, string, string], e: [string, string, string]) => ({
  customerId,
  entryDate: date,
  supplyType: "MANDI" as const,
  morning: { maan: m[0], kg: m[1], ratePerMaan: m[2], ratePerKg: "" },
  evening: { maan: e[0], kg: e[1], ratePerMaan: e[2], ratePerKg: "" },
});

async function newBandhiCustomer(name: string, opening = "0", openingDate = "2026-07-31", type: "BANDHI" | "BOTH" = "BANDHI") {
  const c = await createCustomer(admin, { name, customerType: type, openingBalance: opening, openingBalanceDate: openingDate });
  for (const session of ["MORNING", "EVENING"] as const) {
    await setRate(admin, c.id, { supplyType: "BANDHI", session, defaultMaan: "9", defaultKg: "0", ratePerMaan: "8264", effectiveFrom: "2026-08-01" });
  }
  return c;
}

beforeAll(async () => {
  await seed(prisma, { adminPassword: "test-password" });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("golden statement: S.S.N Dairy Farm 01–05/08/2026", () => {
  it("Bandhi 743,760 + Mandi 110,042.50 + previous 89,774 = Rs. 943,577", async () => {
    const c = await newBandhiCustomer("S.S.N Dairy Farm", "89774", "2026-07-31", "BOTH");
    for (const day of ["01", "02", "03", "04", "05"]) await createEntry(dataEntry, bandhi(c.id, `2026-08-${day}`));
    await createEntry(dataEntry, mandi(c.id, "2026-08-01", ["0", "33", "11300"], ["0", "35", "11300"]));
    await createEntry(dataEntry, mandi(c.id, "2026-08-02", ["0", "15", "11300"], ["0", "24", "11000"]));
    await createEntry(dataEntry, mandi(c.id, "2026-08-03", ["0", "5", "11800"], ["0", "21", "11800"]));
    await createEntry(dataEntry, mandi(c.id, "2026-08-04", ["0", "23", "11300"], ["1", "19", "11800"]));
    await createEntry(dataEntry, mandi(c.id, "2026-08-05", ["1", "23", "12800"], ["2", "5", "13300"]));

    const s = await previewStatement(c.id, parseDate("2026-08-01"), parseDate("2026-08-05"));
    expect(s.totals.openingBalance.toFixed(2)).toBe("89774.00");
    expect(s.totals.totalBandhi.toFixed(2)).toBe("743760.00");
    expect(s.totals.totalMandi.toFixed(2)).toBe("110042.50");
    expect(formatMoney(s.totals.totalMandi)).toBe("110,043");
    expect(s.totals.closingBalance.toFixed(2)).toBe("943576.50");
    expect(formatMoney(s.totals.closingBalance, undefined, true)).toBe("Rs. 943,577");
    // quantity totals as on the sheet
    expect(s.bandhi.totals.MORNING.maan).toBe("45");
    expect(s.mandi.totals.MORNING).toMatchObject({ maan: "1", kg: "99" });
    expect(s.mandi.totals.EVENING).toMatchObject({ maan: "3", kg: "104" });
    // statement == ledger
    expect((await balance(prisma, c.id, { asOf: parseDate("2026-08-05") })).toFixed(2)).toBe("943576.50");
  });
});

describe("milk entries and the ledger", () => {
  it("edit posts a reversal + new line; exactly one active line; balance correct", async () => {
    const c = await newBandhiCustomer("Edit Test");
    const e = await createEntry(admin, bandhi(c.id, "2026-08-10"));
    await updateEntry(admin, e.id, bandhi(c.id, "2026-08-10", { maan: "8" }), "Short supply");
    const lines = await prisma.ledgerEntry.findMany({ where: { sourceId: e.id }, orderBy: { createdAt: "asc" } });
    expect(lines.map((l) => l.txnType)).toEqual(["BANDHI_CHARGE", "REVERSAL", "BANDHI_CHARGE"]);
    expect(lines.filter((l) => l.isActive)).toHaveLength(1);
    expect((await balance(prisma, c.id)).toFixed(2)).toBe("132224.00"); // 16 × 8264
    const ledger = await getLedger(prisma, c.id, parseDate("2026-08-01"), parseDate("2026-08-31"), true);
    expect(ledger.rows).toHaveLength(1);
    expect(ledger.closing).toBe("132224.00");
    expect(await prisma.auditLog.count({ where: { entityId: e.id, action: "UPDATE", reason: "Short supply" } })).toBe(1);
  });

  it("void reverses the charge and frees the slot for a new entry", async () => {
    const c = await newBandhiCustomer("Void Test");
    const e = await createEntry(admin, bandhi(c.id, "2026-08-11"));
    await voidEntry(admin, e.id, "Wrong customer");
    expect((await balance(prisma, c.id)).toFixed(2)).toBe("0.00");
    await createEntry(admin, bandhi(c.id, "2026-08-11"));
    expect((await balance(prisma, c.id)).toFixed(2)).toBe("148752.00");
  });

  it("prevents duplicate entries (service and DB index)", async () => {
    const c = await newBandhiCustomer("Dup Test");
    await createEntry(admin, bandhi(c.id, "2026-08-12"));
    await expect(createEntry(admin, bandhi(c.id, "2026-08-12"))).rejects.toThrow(/already has a BANDHI entry/);
    await expect(
      prisma.milkEntry.create({ data: { customerId: c.id, entryDate: parseDate("2026-08-12"), supplyType: "BANDHI", period: "2026-08", totalAmount: 1 } }),
    ).rejects.toThrow();
  });

  it("ledger lines cannot be deleted and a source cannot have two active lines", async () => {
    const c = await newBandhiCustomer("Ledger Guard");
    const e = await createEntry(admin, bandhi(c.id, "2026-08-13"));
    const line = await prisma.ledgerEntry.findFirstOrThrow({ where: { sourceId: e.id } });
    await expect(prisma.ledgerEntry.delete({ where: { id: line.id } })).rejects.toThrow();
    await expect(
      prisma.ledgerEntry.create({
        data: { ...line, id: undefined, txnNo: "LG-X", createdAt: undefined },
      }),
    ).rejects.toThrow();
  });

  it("historical entries keep their rate after the default rate changes", async () => {
    const c = await newBandhiCustomer("Rate History");
    const before = await createEntry(admin, bandhi(c.id, "2026-08-14"));
    for (const session of ["MORNING", "EVENING"] as const)
      await setRate(admin, c.id, { supplyType: "BANDHI", session, defaultMaan: "10", ratePerMaan: "9000", effectiveFrom: "2026-08-15" });
    const after = await createEntry(admin, { ...bandhi(c.id, "2026-08-15", { maan: "10", rpm: "9000" }) });
    const s1 = await prisma.milkEntrySession.findFirstOrThrow({ where: { milkEntryId: before.id } });
    expect(dec(s1.ratePerMaan).toString()).toBe("8264");
    expect(dec(after.totalAmount).toFixed(2)).toBe("180000.00");
    const rates = await prisma.customerRate.findMany({ where: { customerId: c.id, session: "MORNING" }, orderBy: { effectiveFrom: "asc" } });
    expect(rates[0].effectiveTo?.toISOString().slice(0, 10)).toBe("2026-08-14");
    expect(rates[1].effectiveTo).toBeNull();
    // overlapping rate rows are rejected by the EXCLUDE constraint
    await expect(
      prisma.customerRate.create({
        data: { customerId: c.id, supplyType: "BANDHI", session: "MORNING", ratePerMaan: 1, ratePerKg: 1, effectiveFrom: parseDate("2026-08-20") },
      }),
    ).rejects.toThrow();
  });
});

describe("permissions", () => {
  it("data entry may change Bandhi quantity but not rate (D3 default); viewer cannot enter", async () => {
    const c = await newBandhiCustomer("Perm Test");
    await expect(createEntry(dataEntry, bandhi(c.id, "2026-08-16", { rpm: "9999" }))).rejects.toThrow(/override Bandhi rates/);
    await createEntry(dataEntry, bandhi(c.id, "2026-08-16", { maan: "7" }));
    await expect(createEntry(viewer, bandhi(c.id, "2026-08-17"))).rejects.toThrow(/permission/);
    await expect(recordPayment(dataEntry, { customerId: c.id, paymentDate: "2026-08-16", amount: "10" })).rejects.toThrow(/permission/);
  });

  it("data entry can only edit today's entries", async () => {
    const c = await newBandhiCustomer("Same Day");
    const e = await createEntry(dataEntry, bandhi(c.id, "2026-08-18"));
    await expect(voidEntry(dataEntry, e.id, "oops")).rejects.toThrow(/today's entries/);
    await voidEntry(accountant, e.id, "oops");
  });

  it("only admin can reopen", async () => {
    await expect(reopenPeriod(accountant, "2026-01", "x")).rejects.toThrow(/Only an admin/);
  });
});

describe("payments and allocation", () => {
  it("partial, full and advance payments move the balance and FIFO statuses", async () => {
    const c = await newBandhiCustomer("Pay Test", "1000", "2026-07-31");
    await createEntry(admin, bandhi(c.id, "2026-08-01")); // 148,752
    const st = await generateStatementTx(admin, c.id, "2026-08");
    expect(dec(st.closingBalance).toFixed(2)).toBe("149752.00");

    await recordPayment(accountant, { customerId: c.id, paymentDate: "2026-08-20", amount: "50000" });
    let s = await prisma.monthlyStatement.findUniqueOrThrow({ where: { id: st.id } });
    expect(s.paidStatus).toBe("PARTIAL"); // 1,000 went to the opening balance first

    const p2 = await recordPayment(accountant, { customerId: c.id, paymentDate: "2026-08-21", amount: "99752" });
    s = await prisma.monthlyStatement.findUniqueOrThrow({ where: { id: st.id } });
    expect(s.paidStatus).toBe("PAID");
    expect((await balance(prisma, c.id)).toFixed(2)).toBe("0.00");

    await recordPayment(accountant, { customerId: c.id, paymentDate: "2026-08-22", amount: "5000" });
    expect((await balance(prisma, c.id)).toFixed(2)).toBe("-5000.00"); // advance

    await voidPayment(accountant, p2.id, "Cheque bounced");
    s = await prisma.monthlyStatement.findUniqueOrThrow({ where: { id: st.id } });
    expect(s.paidStatus).toBe("PARTIAL");
    expect((await balance(prisma, c.id)).toFixed(2)).toBe("94752.00"); // 149,752 − 50,000 − 5,000
  });

  it("adjustments land on the correct side", async () => {
    const c = await newBandhiCustomer("Adj Test");
    await createAdjustment(accountant, { customerId: c.id, adjDate: "2026-08-05", type: "ADDITIONAL_CHARGE", amount: "500", reason: "Cans" });
    await createAdjustment(accountant, { customerId: c.id, adjDate: "2026-08-05", type: "DISCOUNT", amount: "200", reason: "Loyalty" });
    const s = await previewStatement(c.id, parseDate("2026-08-01"), parseDate("2026-08-31"));
    expect(s.totals.additionalCharges.toFixed(2)).toBe("500.00");
    expect(s.totals.credits.toFixed(2)).toBe("200.00");
    expect(s.totals.closingBalance.toFixed(2)).toBe("300.00");
  });
});

describe("bulk entry", () => {
  it("is all-or-nothing with a per-row report", async () => {
    const a = await newBandhiCustomer("Bulk A");
    const b = await newBandhiCustomer("Bulk B");
    await createEntry(admin, bandhi(b.id, "2026-08-25")); // makes B's row a duplicate
    const r = await bulkCreate(admin, [bandhi(a.id, "2026-08-25"), bandhi(b.id, "2026-08-25")]);
    expect(r.saved).toBe(0);
    expect(r.results[1].ok).toBe(false);
    expect(await prisma.milkEntry.count({ where: { customerId: a.id } })).toBe(0);
    const ok = await bulkCreate(admin, [bandhi(a.id, "2026-08-25"), bandhi(a.id, "2026-08-26")]);
    expect(ok.saved).toBe(2);
  });
});

describe("monthly closing", () => {
  it("close → carry-forward, guard, reopen → re-close creates version 2", async () => {
    const c = await newBandhiCustomer("Close Test", "0", "2026-07-31");
    await createEntry(admin, bandhi(c.id, "2026-09-01"));
    await createEntry(admin, bandhi(c.id, "2026-10-01"));
    const r = await closePeriod(accountant, "2026-09");
    expect(r.statements).toBeGreaterThan(0);

    // closed-period guard: service + DB trigger
    await expect(createEntry(admin, bandhi(c.id, "2026-09-02"))).rejects.toThrow(/closed/);
    await expect(
      prisma.payment.create({ data: { receiptNo: "X-1", customerId: c.id, paymentDate: parseDate("2026-09-03"), amount: 1 } }),
    ).rejects.toThrow(/PERIOD_CLOSED/);

    await closePeriod(accountant, "2026-10");
    const oct = await prisma.monthlyStatement.findFirstOrThrow({ where: { customerId: c.id, period: "2026-10", status: "FINAL" } });
    expect(dec(oct.openingBalance).toFixed(2)).toBe("148752.00"); // carried forward from September
    expect(dec(oct.closingBalance).toFixed(2)).toBe("297504.00");

    await reopenPeriod(admin, "2026-09", "Missed a day");
    await createEntry(admin, bandhi(c.id, "2026-09-02"));
    const rc = await closePeriod(accountant, "2026-09");
    expect(rc.regenerated).toContain("2026-10");

    const sept = await prisma.monthlyStatement.findMany({ where: { customerId: c.id, period: "2026-09" }, orderBy: { version: "asc" } });
    expect(sept.map((s) => [s.version, s.status])).toEqual([
      [1, "SUPERSEDED"],
      [2, "FINAL"],
    ]);
    expect(dec(sept[0].closingBalance).toFixed(2)).toBe("148752.00"); // original never altered
    expect(dec(sept[1].closingBalance).toFixed(2)).toBe("297504.00");
    const oct2 = await prisma.monthlyStatement.findFirstOrThrow({ where: { customerId: c.id, period: "2026-10", status: "FINAL" } });
    expect(oct2.version).toBe(2);
    expect(dec(oct2.openingBalance).toFixed(2)).toBe("297504.00");
  });
});
