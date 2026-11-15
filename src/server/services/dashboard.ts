import { dec } from "@/lib/calc";
import { prisma, type Db } from "@/lib/db";
import { addDays, isoDate, periodOf, periodRange, previousPeriod, today } from "@/lib/dates";
import { balances } from "./ledger";
import { profitLossRows } from "./reports";

export async function dashboardData(db: Db = prisma) {
  const t = today();
  const period = periodOf(t);
  const { start } = periodRange(period);

  // 12-month window for charts
  let first = period;
  for (let i = 0; i < 11; i++) first = previousPeriod(first);
  const chartFrom = periodRange(first).start;

  const [todayEntries, bal, customers, plRows, recentEntries, recentPayments, recentExpenses] = await Promise.all([
    db.milkEntry.aggregate({ where: { entryDate: t, voidedAt: null }, _sum: { totalAmount: true }, _count: true }),
    balances(db),
    db.customer.findMany({ select: { id: true, name: true, status: true } }),
    profitLossRows(db, chartFrom, t),
    db.milkEntry.findMany({ where: { voidedAt: null }, orderBy: { createdAt: "desc" }, take: 6, include: { customer: { select: { name: true } } } }),
    db.payment.findMany({ where: { voidedAt: null }, orderBy: { createdAt: "desc" }, take: 6, include: { customer: { select: { name: true } } } }),
    db.expense.findMany({ where: { voidedAt: null }, orderBy: { createdAt: "desc" }, take: 6, include: { category: true } }),
  ]);

  const month = plRows.find((r) => r.period === period);
  let outstanding = dec(0);
  let advances = dec(0);
  for (const b of bal.values()) {
    if (b.gt(0)) outstanding = outstanding.plus(b);
    else advances = advances.plus(b.abs());
  }
  const names = new Map(customers.map((c) => [c.id, c.name]));
  const topOutstanding = [...bal.entries()]
    .filter(([, b]) => b.gt(0))
    .sort(([, a], [, b]) => b.cmp(a))
    .slice(0, 8)
    .map(([id, b]) => ({ id, name: names.get(id) ?? id, balance: Number(b.toFixed(2)) }));

  // Fill months without activity so the chart has a continuous axis.
  const months: string[] = [];
  for (let p = first; p <= period; p = periodOf(addDays(periodRange(p).end, 1))) months.push(p);
  const series = months.map((m) => {
    const r = plRows.find((x) => x.period === m);
    const n = (k: string) => Number(r?.[k] ?? 0);
    return { period: m, bandhi: n("bandhi"), mandi: n("mandi"), payments: n("receipts"), expenses: n("expenses"), profit: n("profit") };
  });

  const cards = {
    todaySales: dec(todayEntries._sum.totalAmount).toFixed(2),
    todayEntries: todayEntries._count,
    monthBandhi: String(month?.bandhi ?? "0"),
    monthMandi: String(month?.mandi ?? "0"),
    monthSales: dec(String(month?.bandhi ?? 0)).plus(dec(String(month?.mandi ?? 0))).toFixed(2),
    monthPayments: String(month?.receipts ?? "0"),
    monthExpenses: String(month?.expenses ?? "0"),
    monthProfit: String(month?.profit ?? "0"),
    outstanding: outstanding.toFixed(2),
    advances: advances.toFixed(2),
    activeCustomers: customers.filter((c) => c.status === "ACTIVE").length,
  };

  return {
    period,
    today: isoDate(t),
    monthStart: isoDate(start),
    cards,
    series,
    topOutstanding,
    recentEntries: recentEntries.map((e) => ({ id: e.id, date: isoDate(e.entryDate), customer: e.customer.name, type: e.supplyType, amount: dec(e.totalAmount).toFixed(2) })),
    recentPayments: recentPayments.map((p) => ({ id: p.id, date: isoDate(p.paymentDate), customer: p.customer.name, receipt: p.receiptNo, amount: dec(p.amount).toFixed(2) })),
    recentExpenses: recentExpenses.map((e) => ({ id: e.id, date: isoDate(e.expenseDate), category: e.category.nameEn, description: e.description, amount: dec(e.amount).toFixed(2) })),
  };
}

/** Milk-only dashboard for Data Entry users. */
export async function milkDashboard(db: Db = prisma) {
  const t = today();
  const entries = await db.milkEntry.findMany({ where: { entryDate: t, voidedAt: null }, include: { customer: { select: { name: true } } } });
  const bandhiCustomers = await db.customer.count({ where: { status: "ACTIVE", customerType: { in: ["BANDHI", "BOTH"] } } });
  return {
    today: isoDate(t),
    bandhiDone: entries.filter((e) => e.supplyType === "BANDHI").length,
    mandiDone: entries.filter((e) => e.supplyType === "MANDI").length,
    bandhiCustomers,
  };
}
