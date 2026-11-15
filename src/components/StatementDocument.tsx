import type { Customer } from "@prisma/client";
import { formatDate } from "@/lib/dates";
import { formatExact, formatMoney } from "@/lib/format";
import type { BusinessSettings } from "@/lib/settings";
import type { ComputedStatement } from "@/server/services/statements";
import { BandhiSheet, MandiSheet } from "./SheetTables";

export interface SummaryFigures {
  openingBalance: string;
  totalBandhi: string;
  totalMandi: string;
  totalMilk: string;
  additionalCharges: string;
  payments: string;
  credits: string;
  closingBalance: string;
}

export function summaryFrom(t: ComputedStatement["totals"]): SummaryFigures {
  return {
    openingBalance: t.openingBalance.toFixed(2),
    totalBandhi: t.totalBandhi.toFixed(2),
    totalMandi: t.totalMandi.toFixed(2),
    totalMilk: t.totalMilk.toFixed(2),
    additionalCharges: t.additionalCharges.toFixed(2),
    payments: t.payments.toFixed(2),
    credits: t.credits.toFixed(2),
    closingBalance: t.closingBalance.toFixed(2),
  };
}

/** Printable statement following the existing paper sheet layout. */
export function StatementDocument({
  s,
  customer,
  detail,
  summary,
  meta,
}: {
  s: BusinessSettings;
  customer: Customer;
  detail: ComputedStatement;
  summary: SummaryFigures;
  meta?: { statementNo: string; version: number; status: string; generatedAt: Date };
}) {
  const row = (label: string, v: string, cls = "") => (
    <tr className={cls}>
      <td className="border border-slate-400 px-3 py-1.5">{label}</td>
      <td className="num border border-slate-400 px-3 py-1.5">{formatMoney(v, s)}</td>
    </tr>
  );
  return (
    <article className="card space-y-5 p-6 print:p-0">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-slate-800 pb-3">
        <div>
          <h1 className="text-2xl font-bold">{s.businessName}</h1>
          {s.businessNameUr && (
            <div className="font-urdu text-lg" dir="rtl">
              {s.businessNameUr}
            </div>
          )}
          <div className="text-sm text-slate-600">{[s.address, s.phone].filter(Boolean).join(" · ")}</div>
        </div>
        <div className="text-right text-sm">
          <div className="text-lg font-semibold tracking-wide uppercase">Customer statement</div>
          <div>
            {formatDate(detail.start)} – {formatDate(detail.end)}
          </div>
          {meta ? (
            <div className="text-slate-600">
              {meta.statementNo} · v{meta.version} · {meta.status}
            </div>
          ) : (
            <div className="font-medium text-amber-700">PREVIEW (not saved)</div>
          )}
        </div>
      </header>

      <section className="grid gap-1 text-sm sm:grid-cols-2">
        <div>
          <span className="text-slate-500">Customer:</span> <b>{customer.name}</b> ({customer.code})
          {customer.nameUr && (
            <span className="font-urdu ml-2" dir="rtl">
              {customer.nameUr}
            </span>
          )}
        </div>
        <div>
          <span className="text-slate-500">Business:</span> {customer.businessName ?? "—"}
        </div>
        <div>
          <span className="text-slate-500">Mobile:</span> {customer.mobile ?? "—"}
        </div>
        <div>
          <span className="text-slate-500">Address:</span> {[customer.address, customer.city].filter(Boolean).join(", ") || "—"}
        </div>
      </section>

      {(detail.bandhi.rows.length > 0 || customer.customerType !== "MANDI") && <BandhiSheet title={s.businessName} rows={detail.bandhi.rows} totals={detail.bandhi.totals} s={s} />}
      {(detail.mandi.rows.length > 0 || customer.customerType !== "BANDHI") && <MandiSheet title={s.businessName} rows={detail.mandi.rows} totals={detail.mandi.totals} s={s} />}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4 text-sm">
          {detail.payments.length > 0 && (
            <div>
              <h3 className="mb-1 font-semibold">Payments received</h3>
              <table className="sheet w-full border-collapse">
                <tbody>
                  {detail.payments.map((p) => (
                    <tr key={p.id}>
                      <td>{formatDate(p.paymentDate)}</td>
                      <td>
                        {p.receiptNo} · {p.method}
                      </td>
                      <td className="num">{formatExact(p.amount, s.grouping)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {detail.adjustments.length > 0 && (
            <div>
              <h3 className="mb-1 font-semibold">Charges & adjustments</h3>
              <table className="sheet w-full border-collapse">
                <tbody>
                  {detail.adjustments.map((a) => (
                    <tr key={a.id}>
                      <td>{formatDate(a.adjDate)}</td>
                      <td>
                        {a.type.replace(/_/g, " ").toLowerCase()} · {a.reason}
                      </td>
                      <td className="num">{formatExact(a.amount, s.grouping)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="text-xs text-slate-600">
            Quantity: Bandhi {detail.bandhi.totals.MORNING.totalKg}+{detail.bandhi.totals.EVENING.totalKg} KG · Mandi {detail.mandi.totals.MORNING.totalKg}+
            {detail.mandi.totals.EVENING.totalKg} KG (morning+evening)
          </div>
        </div>

        <table className="w-full border-collapse self-start text-sm">
          <tbody>
            {row("Total Bandhi Amount", summary.totalBandhi, "bg-green-50")}
            {row("Total Mandi Amount", summary.totalMandi, "bg-green-50")}
            {row("Previous Remaining Balance", summary.openingBalance)}
            {Number(summary.additionalCharges) !== 0 && row("Additional Charges", summary.additionalCharges)}
            {Number(summary.payments) !== 0 && row("Less: Payments Received", summary.payments)}
            {Number(summary.credits) !== 0 && row("Less: Discounts / Credits", summary.credits)}
            <tr className="text-base font-bold">
              <td className="border border-slate-400 bg-red-600 px-3 py-2 text-white">Total Payable</td>
              <td className="num border border-slate-400 bg-red-600 px-3 py-2 text-white">{formatMoney(summary.closingBalance, s, true)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <footer className="pt-10 text-sm">
        <div className="grid grid-cols-2 gap-12 text-center text-xs text-slate-500">
          <div className="border-t border-slate-400 pt-1">Prepared by</div>
          <div className="border-t border-slate-400 pt-1">Customer signature</div>
        </div>
        {s.statementFooter && <p className="mt-6 text-center text-xs text-slate-600">{s.statementFooter}</p>}
      </footer>
    </article>
  );
}
