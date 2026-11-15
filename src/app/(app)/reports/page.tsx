import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isoDate, periodOf, periodRange, today, todayIso } from "@/lib/dates";
import { PERMISSIONS } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { PrintButton } from "@/components/PrintButton";
import { ReportView } from "@/components/ReportView";
import { CustomerOptions, Empty, PageHeader } from "@/components/ui";
import { REPORTS, runReport, type ReportKey, type ReportParams } from "@/server/services/reports";
import { listCategories } from "@/server/services/expenses";
import { AppError } from "@/lib/errors";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePage(PERMISSIONS.REPORTS_VIEW);
  const sp = await searchParams;
  const key = (REPORTS.find((r) => r.key === sp.key)?.key ?? "daily-milk") as ReportKey;
  const meta = REPORTS.find((r) => r.key === key)!;
  const t = today();
  const p: ReportParams = {
    date: sp.date || todayIso(),
    from: sp.from || isoDate(periodRange(periodOf(t)).start),
    to: sp.to || todayIso(),
    period: sp.period || periodOf(t),
    asOf: sp.asOf || todayIso(),
    customerId: sp.customerId,
    method: sp.method,
    categoryId: sp.categoryId,
  };
  const [customers, cats, s] = await Promise.all([prisma.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }), listCategories(), getSettings()]);

  let report = null;
  let error: string | null = null;
  if (sp.run) {
    try {
      report = await runReport(key, p);
    } catch (e) {
      error = e instanceof AppError ? e.message : "Could not run the report.";
    }
  }
  const has = (k: string) => (meta.params as readonly string[]).includes(k);
  const exportQs = new URLSearchParams(Object.entries({ ...p }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle={report ? `${report.title} · ${report.subtitle}` : undefined}
        actions={
          report && (
            <>
              <a href={`/api/v1/reports/${key}/xlsx?${exportQs}`} className="btn-secondary">
                Excel
              </a>
              <PrintButton />
            </>
          )
        }
      />
      <form method="get" className="no-print card mb-4 flex flex-wrap items-end gap-3 p-4">
        <input type="hidden" name="run" value="1" />
        <label className="min-w-64 flex-1">
          <span className="label">Report</span>
          <select name="key" defaultValue={key} className="input">
            {REPORTS.map((r) => (
              <option key={r.key} value={r.key}>
                {r.title}
              </option>
            ))}
          </select>
        </label>
        {has("date") && (
          <label>
            <span className="label">Date</span>
            <input type="date" name="date" defaultValue={p.date} className="input" />
          </label>
        )}
        {has("asOf") && (
          <label>
            <span className="label">As of</span>
            <input type="date" name="asOf" defaultValue={p.asOf} className="input" />
          </label>
        )}
        {has("period") && (
          <label>
            <span className="label">Month</span>
            <input type="month" name="period" defaultValue={p.period} className="input" />
          </label>
        )}
        {has("from") && (
          <>
            <label>
              <span className="label">From</span>
              <input type="date" name="from" defaultValue={p.from} className="input" />
            </label>
            <label>
              <span className="label">To</span>
              <input type="date" name="to" defaultValue={p.to} className="input" />
            </label>
          </>
        )}
        {has("customerId") && (
          <label>
            <span className="label">Customer</span>
            <select name="customerId" defaultValue={p.customerId ?? ""} className="input">
              <option value="">Select…</option>
              <CustomerOptions customers={customers} />
            </select>
          </label>
        )}
        {has("method") && (
          <label>
            <span className="label">Method</span>
            <select name="method" defaultValue={p.method ?? ""} className="input">
              <option value="">All</option>
              {["CASH", "BANK", "JAZZCASH", "EASYPAISA", "OTHER"].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
        )}
        {has("categoryId") && (
          <label>
            <span className="label">Category</span>
            <select name="categoryId" defaultValue={p.categoryId ?? ""} className="input">
              <option value="">All</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nameEn}
                </option>
              ))}
            </select>
          </label>
        )}
        <button className="btn-primary">Run</button>
      </form>
      <p className="no-print mb-4 text-xs text-slate-500">
        The monthly customer statement and complete customer ledger are under Monthly Statements and Customer Ledger (both with Excel and print).
      </p>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {report ? (
        <>
          <h2 className="mb-3 hidden text-center text-lg font-semibold print:block">
            {s.businessName} — {report.title} — {report.subtitle}
          </h2>
          <ReportView report={report} s={s} />
        </>
      ) : (
        !error && <Empty>Pick a report and press Run.</Empty>
      )}
    </>
  );
}
