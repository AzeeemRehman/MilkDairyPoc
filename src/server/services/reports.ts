/**
 * Reports (PLANNING.md §10). Every report returns generic table sections so the same data
 * renders on screen, prints, and exports to Excel with real numeric cells.
 */
import { dec, sum } from "@/lib/calc";
import { prisma, type Db } from "@/lib/db";
import { daysBetween, formatDate, isoDate, periodOf, periodRange } from "@/lib/dates";
import { invalid } from "@/lib/errors";
import { balances } from "./ledger";

export type ColType = "text" | "date" | "money" | "qty" | "number";
export interface Column {
  key: string;
  label: string;
  type: ColType;
}
export type Cell = string | number | null;
export interface ReportSection {
  title: string;
  columns: Column[];
  rows: Record<string, Cell>[];
  totals?: Record<string, Cell>;
}
export interface Report {
  key: string;
  title: string;
  subtitle: string;
  sections: ReportSection[];
}

export const REPORTS = [
  { key: "daily-milk", title: "Daily Milk Report", params: ["date"] },
  { key: "customer-daily", title: "Customer-wise Daily Report", params: ["customerId", "from", "to"] },
  { key: "bandhi-monthly", title: "Bandhi Monthly Report", params: ["period"] },
  { key: "mandi-monthly", title: "Mandi Monthly Report", params: ["period"] },
  { key: "outstanding", title: "Customer Outstanding Report (with aging)", params: ["asOf"] },
  { key: "payments", title: "Payment Collection Report", params: ["from", "to", "method"] },
  { key: "expenses", title: "Expense Report", params: ["from", "to", "categoryId"] },
  { key: "profit-loss", title: "Monthly Profit/Loss & Cash Flow", params: ["from", "to"] },
] as const;
export type ReportKey = (typeof REPORTS)[number]["key"];

const tot = (rows: Record<string, Cell>[], key: string) => sum(rows.map((r) => (r[key] as string) ?? 0)).toFixed(2);
const qtyTot = (rows: Record<string, Cell>[], key: string) => sum(rows.map((r) => (r[key] as string) ?? 0)).toString();

const milkColumns = (withCustomer: boolean, withDate: boolean): Column[] => [
  ...(withDate ? [{ key: "date", label: "Date", type: "date" as const }] : []),
  ...(withCustomer ? [{ key: "customer", label: "Customer", type: "text" as const }] : []),
  { key: "mMaan", label: "Morning Maan", type: "qty" },
  { key: "mKg", label: "Morning KG", type: "qty" },
  { key: "mRate", label: "Rate/Maan (M)", type: "number" },
  { key: "eMaan", label: "Evening Maan", type: "qty" },
  { key: "eKg", label: "Evening KG", type: "qty" },
  { key: "eRate", label: "Rate/Maan (E)", type: "number" },
  { key: "amount", label: "Amount", type: "money" },
];

async function milkRows(db: Db, where: { from: Date; to: Date; customerId?: string; supplyType: "BANDHI" | "MANDI" }) {
  const entries = await db.milkEntry.findMany({
    where: { voidedAt: null, supplyType: where.supplyType, customerId: where.customerId, entryDate: { gte: where.from, lte: where.to } },
    include: { sessions: true, customer: { select: { name: true, code: true } } },
    orderBy: [{ entryDate: "asc" }, { customer: { name: "asc" } }],
  });
  return entries.map((e) => {
    const m = e.sessions.find((s) => s.session === "MORNING");
    const ev = e.sessions.find((s) => s.session === "EVENING");
    return {
      date: isoDate(e.entryDate),
      customer: e.customer.name,
      mMaan: m ? dec(m.maan).toString() : "0",
      mKg: m ? dec(m.kg).toString() : "0",
      mRate: m ? dec(m.ratePerMaan).toString() : null,
      eMaan: ev ? dec(ev.maan).toString() : "0",
      eKg: ev ? dec(ev.kg).toString() : "0",
      eRate: ev ? dec(ev.ratePerMaan).toString() : null,
      amount: dec(e.totalAmount).toFixed(2),
    } as Record<string, Cell>;
  });
}

function milkSection(title: string, columns: Column[], rows: Record<string, Cell>[]): ReportSection {
  return {
    title,
    columns,
    rows,
    totals: { mMaan: qtyTot(rows, "mMaan"), mKg: qtyTot(rows, "mKg"), eMaan: qtyTot(rows, "eMaan"), eKg: qtyTot(rows, "eKg"), amount: tot(rows, "amount") },
  };
}

async function monthlyBySupply(db: Db, period: string, supplyType: "BANDHI" | "MANDI"): Promise<ReportSection> {
  const { start, end } = periodRange(period);
  const rows = await milkRows(db, { from: start, to: end, supplyType });
  const byCustomer = new Map<string, Record<string, Cell>>();
  for (const r of rows) {
    const k = r.customer as string;
    const acc = byCustomer.get(k) ?? { customer: k, days: 0, mMaan: "0", mKg: "0", eMaan: "0", eKg: "0", amount: "0" };
    acc.days = (acc.days as number) + 1;
    for (const f of ["mMaan", "mKg", "eMaan", "eKg", "amount"]) acc[f] = dec(acc[f] as string).plus(dec(r[f] as string)).toString();
    byCustomer.set(k, acc);
  }
  const out = [...byCustomer.values()].map((r) => ({ ...r, amount: dec(r.amount as string).toFixed(2) }));
  return {
    title: `${supplyType === "BANDHI" ? "Bandhi" : "Mandi"} — ${period}`,
    columns: [
      { key: "customer", label: "Customer", type: "text" },
      { key: "days", label: "Days", type: "number" },
      { key: "mMaan", label: "Morning Maan", type: "qty" },
      { key: "mKg", label: "Morning KG", type: "qty" },
      { key: "eMaan", label: "Evening Maan", type: "qty" },
      { key: "eKg", label: "Evening KG", type: "qty" },
      { key: "amount", label: "Amount", type: "money" },
    ],
    rows: out,
    totals: { mMaan: qtyTot(out, "mMaan"), mKg: qtyTot(out, "mKg"), eMaan: qtyTot(out, "eMaan"), eKg: qtyTot(out, "eKg"), amount: tot(out, "amount") },
  };
}

/**
 * Outstanding with aging. Payments settle the oldest debits first, so the outstanding
 * balance is made up of the most recent debits; walk backwards to bucket it by age.
 */
async function outstanding(db: Db, asOf: Date): Promise<ReportSection> {
  const bal = await balances(db, asOf);
  const customers = await db.customer.findMany({ select: { id: true, name: true, code: true, mobile: true } });
  const rows: Record<string, Cell>[] = [];
  for (const c of customers) {
    const b = bal.get(c.id) ?? dec(0);
    if (b.isZero()) continue;
    const buckets = [dec(0), dec(0), dec(0), dec(0)];
    if (b.gt(0)) {
      const debits = await db.ledgerEntry.findMany({
        where: { customerId: c.id, txnDate: { lte: asOf }, debit: { gt: 0 }, txnType: { not: "REVERSAL" }, isActive: true },
        orderBy: { txnDate: "desc" },
        select: { txnDate: true, debit: true },
      });
      let left = b;
      for (const d of debits) {
        if (left.lte(0)) break;
        const take = dec(d.debit).lt(left) ? dec(d.debit) : left;
        const age = daysBetween(d.txnDate, asOf);
        buckets[age <= 30 ? 0 : age <= 60 ? 1 : age <= 90 ? 2 : 3] = buckets[age <= 30 ? 0 : age <= 60 ? 1 : age <= 90 ? 2 : 3].plus(take);
        left = left.minus(take);
      }
      if (left.gt(0)) buckets[3] = buckets[3].plus(left);
    }
    rows.push({
      code: c.code,
      customer: c.name,
      mobile: c.mobile,
      balance: b.toFixed(2),
      a0: buckets[0].toFixed(2),
      a30: buckets[1].toFixed(2),
      a60: buckets[2].toFixed(2),
      a90: buckets[3].toFixed(2),
    });
  }
  rows.sort((a, b) => dec(b.balance as string).cmp(dec(a.balance as string)));
  return {
    title: `Outstanding as of ${formatDate(asOf)}`,
    columns: [
      { key: "code", label: "Code", type: "text" },
      { key: "customer", label: "Customer", type: "text" },
      { key: "mobile", label: "Mobile", type: "text" },
      { key: "balance", label: "Balance", type: "money" },
      { key: "a0", label: "0–30 days", type: "money" },
      { key: "a30", label: "31–60", type: "money" },
      { key: "a60", label: "61–90", type: "money" },
      { key: "a90", label: "90+", type: "money" },
    ],
    rows,
    totals: Object.fromEntries(["balance", "a0", "a30", "a60", "a90"].map((k) => [k, tot(rows, k)])),
  };
}

export interface ReportParams {
  date?: string;
  from?: string;
  to?: string;
  period?: string;
  asOf?: string;
  customerId?: string;
  method?: string;
  categoryId?: string;
}

function need<T>(v: T | undefined, name: string): T {
  if (v === undefined || v === null || v === "") throw invalid(`Choose a ${name}.`);
  return v;
}

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

export async function runReport(key: ReportKey, p: ReportParams, db: Db = prisma): Promise<Report> {
  const meta = REPORTS.find((r) => r.key === key);
  if (!meta) throw invalid("Unknown report.");
  switch (key) {
    case "daily-milk": {
      const date = d(need(p.date, "date"));
      const cols = milkColumns(true, false);
      const [b, m] = await Promise.all([
        milkRows(db, { from: date, to: date, supplyType: "BANDHI" }),
        milkRows(db, { from: date, to: date, supplyType: "MANDI" }),
      ]);
      return { key, title: meta.title, subtitle: formatDate(date), sections: [milkSection("Bandhi", cols, b), milkSection("Mandi", cols, m)] };
    }
    case "customer-daily": {
      const customerId = need(p.customerId, "customer");
      const from = d(need(p.from, "start date"));
      const to = d(need(p.to, "end date"));
      const c = await db.customer.findUniqueOrThrow({ where: { id: customerId } });
      const cols = milkColumns(false, true);
      const [b, m] = await Promise.all([
        milkRows(db, { from, to, customerId, supplyType: "BANDHI" }),
        milkRows(db, { from, to, customerId, supplyType: "MANDI" }),
      ]);
      return { key, title: meta.title, subtitle: `${c.name} · ${formatDate(from)} – ${formatDate(to)}`, sections: [milkSection("Bandhi", cols, b), milkSection("Mandi", cols, m)] };
    }
    case "bandhi-monthly":
    case "mandi-monthly": {
      const period = need(p.period, "month");
      return { key, title: meta.title, subtitle: period, sections: [await monthlyBySupply(db, period, key === "bandhi-monthly" ? "BANDHI" : "MANDI")] };
    }
    case "outstanding": {
      const asOf = d(need(p.asOf, "date"));
      return { key, title: meta.title, subtitle: formatDate(asOf), sections: [await outstanding(db, asOf)] };
    }
    case "payments": {
      const from = d(need(p.from, "start date"));
      const to = d(need(p.to, "end date"));
      const pays = await db.payment.findMany({
        where: { voidedAt: null, paymentDate: { gte: from, lte: to }, method: p.method ? (p.method as never) : undefined },
        include: { customer: { select: { name: true } } },
        orderBy: { paymentDate: "asc" },
      });
      const rows = pays.map((x) => ({ date: isoDate(x.paymentDate), receipt: x.receiptNo, customer: x.customer.name, method: x.method, reference: x.reference, amount: dec(x.amount).toFixed(2) }));
      const byMethod = new Map<string, string>();
      for (const r of rows) byMethod.set(r.method, dec(byMethod.get(r.method) ?? 0).plus(dec(r.amount)).toFixed(2));
      return {
        key,
        title: meta.title,
        subtitle: `${formatDate(from)} – ${formatDate(to)}${p.method ? " · " + p.method : ""}`,
        sections: [
          {
            title: "Payments",
            columns: [
              { key: "date", label: "Date", type: "date" },
              { key: "receipt", label: "Receipt", type: "text" },
              { key: "customer", label: "Customer", type: "text" },
              { key: "method", label: "Method", type: "text" },
              { key: "reference", label: "Reference", type: "text" },
              { key: "amount", label: "Amount", type: "money" },
            ],
            rows,
            totals: { amount: tot(rows, "amount") },
          },
          {
            title: "By method",
            columns: [
              { key: "method", label: "Method", type: "text" },
              { key: "amount", label: "Amount", type: "money" },
            ],
            rows: [...byMethod].map(([method, amount]) => ({ method, amount })),
            totals: { amount: tot(rows, "amount") },
          },
        ],
      };
    }
    case "expenses": {
      const from = d(need(p.from, "start date"));
      const to = d(need(p.to, "end date"));
      const ex = await db.expense.findMany({
        where: { voidedAt: null, expenseDate: { gte: from, lte: to }, categoryId: p.categoryId || undefined },
        include: { category: true },
        orderBy: { expenseDate: "asc" },
      });
      const rows = ex.map((x) => ({ date: isoDate(x.expenseDate), category: x.category.nameEn, description: x.description, method: x.method, amount: dec(x.amount).toFixed(2) }));
      const byCat = new Map<string, string>();
      for (const r of rows) byCat.set(r.category, dec(byCat.get(r.category) ?? 0).plus(dec(r.amount)).toFixed(2));
      return {
        key,
        title: meta.title,
        subtitle: `${formatDate(from)} – ${formatDate(to)}`,
        sections: [
          {
            title: "Expenses",
            columns: [
              { key: "date", label: "Date", type: "date" },
              { key: "category", label: "Category", type: "text" },
              { key: "description", label: "Description", type: "text" },
              { key: "method", label: "Method", type: "text" },
              { key: "amount", label: "Amount", type: "money" },
            ],
            rows,
            totals: { amount: tot(rows, "amount") },
          },
          {
            title: "By category",
            columns: [
              { key: "category", label: "Category", type: "text" },
              { key: "amount", label: "Amount", type: "money" },
            ],
            rows: [...byCat].map(([category, amount]) => ({ category, amount })),
            totals: { amount: tot(rows, "amount") },
          },
        ],
      };
    }
    case "profit-loss": {
      const from = d(need(p.from, "start date"));
      const to = d(need(p.to, "end date"));
      const rows = await profitLossRows(db, from, to);
      return {
        key,
        title: meta.title,
        subtitle: `${formatDate(from)} – ${formatDate(to)}`,
        sections: [
          {
            title: "Profit / Loss (accrual) and Cash Flow (cash basis)",
            columns: [
              { key: "period", label: "Month", type: "text" },
              { key: "bandhi", label: "Bandhi sales", type: "money" },
              { key: "mandi", label: "Mandi sales", type: "money" },
              { key: "charges", label: "Other charges", type: "money" },
              { key: "discounts", label: "Discounts/credits", type: "money" },
              { key: "revenue", label: "Net revenue", type: "money" },
              { key: "expenses", label: "Expenses", type: "money" },
              { key: "profit", label: "Profit/Loss", type: "money" },
              { key: "receipts", label: "Cash received", type: "money" },
              { key: "refunds", label: "Refunds paid", type: "money" },
              { key: "cashflow", label: "Net cash flow", type: "money" },
            ],
            rows,
            totals: Object.fromEntries(["bandhi", "mandi", "charges", "discounts", "revenue", "expenses", "profit", "receipts", "refunds", "cashflow"].map((k) => [k, tot(rows, k)])),
          },
        ],
      };
    }
  }
}

/** Monthly P&L rows from the ledger (net of reversals) and expenses. */
export async function profitLossRows(db: Db, from: Date, to: Date) {
  const lines = await db.ledgerEntry.findMany({
    where: { txnDate: { gte: from, lte: to } },
    select: { period: true, txnType: true, debit: true, credit: true, reverses: { select: { txnType: true } } },
  });
  const expenses = await db.expense.findMany({ where: { voidedAt: null, expenseDate: { gte: from, lte: to } }, select: { expenseDate: true, amount: true } });
  const z = () => ({ bandhi: dec(0), mandi: dec(0), charges: dec(0), discounts: dec(0), expenses: dec(0), receipts: dec(0), refunds: dec(0) });
  const by = new Map<string, ReturnType<typeof z>>();
  const get = (p: string) => by.get(p) ?? (by.set(p, z()), by.get(p)!);
  for (const l of lines) {
    const t = l.txnType === "REVERSAL" ? l.reverses?.txnType : l.txnType;
    const net = dec(l.debit).minus(dec(l.credit));
    const a = get(l.period);
    if (t === "BANDHI_CHARGE") a.bandhi = a.bandhi.plus(net);
    else if (t === "MANDI_CHARGE") a.mandi = a.mandi.plus(net);
    else if (t === "ADDITIONAL_CHARGE" || t === "DEBIT_ADJ") a.charges = a.charges.plus(net);
    else if (t === "DISCOUNT" || t === "CREDIT_ADJ" || t === "CASH_ADJ") a.discounts = a.discounts.minus(net);
    else if (t === "PAYMENT") a.receipts = a.receipts.minus(net);
    else if (t === "REFUND") a.refunds = a.refunds.plus(net);
  }
  for (const e of expenses) {
    const a = get(periodOf(e.expenseDate));
    a.expenses = a.expenses.plus(dec(e.amount));
  }
  return [...by.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, a]) => {
      const revenue = a.bandhi.plus(a.mandi).plus(a.charges).minus(a.discounts);
      return {
        period,
        bandhi: a.bandhi.toFixed(2),
        mandi: a.mandi.toFixed(2),
        charges: a.charges.toFixed(2),
        discounts: a.discounts.toFixed(2),
        revenue: revenue.toFixed(2),
        expenses: a.expenses.toFixed(2),
        profit: revenue.minus(a.expenses).toFixed(2),
        receipts: a.receipts.toFixed(2),
        refunds: a.refunds.toFixed(2),
        cashflow: a.receipts.minus(a.refunds).minus(a.expenses).toFixed(2),
      } as Record<string, Cell>;
    });
}
