import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate, isoDate, isValidPeriod, parseDate, periodOf, periodRange, today } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { ActionForm } from "@/components/ActionForm";
import { PrintButton } from "@/components/PrintButton";
import { StatementDocument, summaryFrom } from "@/components/StatementDocument";
import { Badge, Card, CustomerOptions, Empty, PageHeader } from "@/components/ui";
import { listStatements, previewStatement } from "@/server/services/statements";
import { periodStatus } from "@/server/services/periods";
import { generateStatementAction } from "@/app/actions/finance";

export const metadata = { title: "Monthly statements" };

export default async function StatementsPage({ searchParams }: { searchParams: Promise<{ customerId?: string; period?: string; from?: string; to?: string; mode?: string }> }) {
  const user = await requirePage(PERMISSIONS.STATEMENTS_VIEW);
  const sp = await searchParams;
  const mode = sp.mode === "range" ? "range" : "month";
  const period = sp.period && isValidPeriod(sp.period) ? sp.period : periodOf(today());
  const pr = periodRange(period);
  const from = mode === "range" && sp.from ? sp.from : isoDate(pr.start);
  const to = mode === "range" && sp.to ? sp.to : isoDate(pr.end);

  const [customers, s] = await Promise.all([prisma.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }), getSettings()]);
  const customerId = customers.some((c) => c.id === sp.customerId) ? sp.customerId! : null;
  const detail = customerId ? await previewStatement(customerId, parseDate(from), parseDate(to)) : null;
  const versions = customerId && mode === "month" ? await listStatements({ customerId, period }) : [];
  const recent = !customerId ? await listStatements({ period }) : [];
  const status = await periodStatus(prisma, period);
  const xlsx = customerId ? `/api/v1/statements/xlsx?${new URLSearchParams({ customerId, from, to })}` : "";

  return (
    <>
      <PageHeader
        title="Monthly statements"
        subtitle={`Statements read the ledger and never post to it. ${period} is ${status}.`}
        actions={
          detail && (
            <>
              <a href={xlsx} className="btn-secondary">
                Excel
              </a>
              <PrintButton />
            </>
          )
        }
      />
      <form method="get" className="no-print card mb-4 grid gap-3 p-4 sm:grid-cols-6">
        <select name="customerId" defaultValue={customerId ?? ""} className="input sm:col-span-2">
          <option value="">All customers (list)</option>
          <CustomerOptions customers={customers} />
        </select>
        <select name="mode" defaultValue={mode} className="input">
          <option value="month">Month</option>
          <option value="range">Custom range</option>
        </select>
        <input type="month" name="period" defaultValue={period} className="input" />
        <input type="date" name="from" defaultValue={mode === "range" ? from : ""} className="input" placeholder="From (range)" />
        <div className="flex gap-2">
          <input type="date" name="to" defaultValue={mode === "range" ? to : ""} className="input" />
          <button className="btn-primary">Preview</button>
        </div>
      </form>

      {detail && customerId && mode === "month" && user.permissions.has(PERMISSIONS.STATEMENTS_GENERATE) && (
        <Card className="no-print mb-4">
          <ActionForm action={generateStatementAction} submitLabel={versions.length ? "Generate new version" : "Generate & finalise"}>
            <input type="hidden" name="customerId" value={customerId} />
            <input type="hidden" name="period" value={period} />
            <p className="text-sm text-slate-600">
              Saves an immutable FINAL snapshot for {period}. Earlier versions become SUPERSEDED and stay readable. Month closing also generates statements for every customer automatically.
            </p>
          </ActionForm>
          {versions.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {versions.map((v) => (
                <li key={v.id}>
                  <Link href={`/statements/${v.id}`} className="text-brand-800 hover:underline">
                    {v.statementNo} v{v.version}
                  </Link>{" "}
                  <Badge tone={v.status === "FINAL" ? "green" : "slate"}>{v.status}</Badge> {v.status === "FINAL" && <Badge tone={v.paidStatus === "PAID" ? "green" : v.paidStatus === "PARTIAL" ? "amber" : "red"}>{v.paidStatus}</Badge>} ·
                  closing {formatMoney(v.closingBalance, s)} · {v.generatedAt.toLocaleString("en-GB", { timeZone: "Asia/Karachi" })}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {detail ? (
        <StatementDocument s={s} customer={detail.customer} detail={detail} summary={summaryFrom(detail.totals)} />
      ) : (
        <Card title={`Statements for ${period}`} className="overflow-x-auto">
          {recent.length === 0 ? (
            <Empty>No statements generated for {period} yet. Pick a customer to preview one.</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>No.</th>
                  <th>Status</th>
                  <th>Paid</th>
                  <th className="text-right">Milk</th>
                  <th className="text-right">Payments</th>
                  <th className="text-right">Closing</th>
                </tr>
              </thead>
              <tbody>
                {recent
                  .filter((r) => r.status === "FINAL")
                  .map((r) => (
                    <tr key={r.id}>
                      <td>{r.customer.name}</td>
                      <td>
                        <Link href={`/statements/${r.id}`} className="text-brand-800 hover:underline">
                          {r.statementNo}
                        </Link>{" "}
                        v{r.version}
                      </td>
                      <td>
                        <Badge tone="green">{r.status}</Badge>
                      </td>
                      <td>
                        <Badge tone={r.paidStatus === "PAID" ? "green" : r.paidStatus === "PARTIAL" ? "amber" : "red"}>{r.paidStatus}</Badge>
                      </td>
                      <td className="num">{formatMoney(r.totalMilk, s)}</td>
                      <td className="num">{formatMoney(r.payments, s)}</td>
                      <td className="num font-medium">{formatMoney(r.closingBalance, s)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
          <p className="mt-2 text-xs text-slate-500">Period {formatDate(from)} – {formatDate(to)}.</p>
        </Card>
      )}
    </>
  );
}
