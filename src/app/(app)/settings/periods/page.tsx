import { requirePage } from "@/lib/auth";
import { formatPeriod, isValidPeriod, periodOf, previousPeriod, today } from "@/lib/dates";
import { PERMISSIONS } from "@/lib/permissions";
import { ReasonButton } from "@/components/ReasonButton";
import { Badge, Card, PageHeader } from "@/components/ui";
import { listPeriods, preCloseChecks } from "@/server/services/periods";
import { closePeriodAction, reopenPeriodAction } from "@/app/actions/finance";

export const metadata = { title: "Accounting periods" };

export default async function PeriodsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const user = await requirePage(PERMISSIONS.PERIOD_CLOSE);
  const sp = await searchParams;
  const candidate = sp.period && isValidPeriod(sp.period) ? sp.period : previousPeriod(periodOf(today()));
  const [periods, warnings] = await Promise.all([listPeriods(), preCloseChecks(candidate)]);
  const status = periods.find((p) => p.period === candidate)?.status ?? "OPEN";

  return (
    <>
      <PageHeader title="Accounting periods" subtitle="Closing finalises statements for every customer, reconciles them with the ledger and locks the month." />
      <Card title={`Close a month · ${formatPeriod(candidate)} (${status})`} className="mb-6">
        <form method="get" className="mb-4 flex gap-2">
          <input type="month" name="period" defaultValue={candidate} className="input w-auto" />
          <button className="btn-secondary">Check</button>
        </form>
        <h3 className="text-sm font-semibold">Pre-close checks ({warnings.length} warning{warnings.length === 1 ? "" : "s"})</h3>
        {warnings.length === 0 ? (
          <p className="mt-1 text-sm text-green-700">No warnings.</p>
        ) : (
          <ul className="mt-1 max-h-64 list-inside list-disc overflow-y-auto text-sm text-amber-800">
            {warnings.map((w, i) => (
              <li key={i}>{w.message}</li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-slate-500">Warnings do not block closing. Reconciliation mismatches do.</p>
        {status !== "CLOSED" && (
          <div className="mt-4">
            <ReasonButton
              label={`Close ${candidate}`}
              className="btn-primary"
              title={`Close ${formatPeriod(candidate)}?`}
              description={"Final statements will be generated for every customer with activity or a balance.\nEntries, payments and adjustments dated in this month will be locked."}
              danger={false}
              requireReason={false}
              run={closePeriodAction.bind(null, candidate)}
            />
          </div>
        )}
      </Card>
      <Card title="Periods" className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Status</th>
              <th>Closed</th>
              <th>Reopened</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => (
              <tr key={p.id}>
                <td>{formatPeriod(p.period)}</td>
                <td>
                  <Badge tone={p.status === "CLOSED" ? "green" : p.status === "REOPENED" ? "amber" : "slate"}>{p.status}</Badge>{" "}
                  {p.needsReclose && p.status !== "OPEN" && <Badge tone="red">balance changed upstream</Badge>}
                </td>
                <td className="text-xs">{p.closedAt?.toLocaleString("en-GB", { timeZone: "Asia/Karachi" })}</td>
                <td className="text-xs">
                  {p.reopenedAt?.toLocaleString("en-GB", { timeZone: "Asia/Karachi" })} {p.reopenReason && `— ${p.reopenReason}`}
                </td>
                <td className="text-right whitespace-nowrap">
                  {p.status === "CLOSED" && user.permissions.has(PERMISSIONS.PERIOD_REOPEN) && (
                    <ReasonButton label="Reopen" title={`Reopen ${p.period}?`} description="Edits will be allowed again (with audit). Re-closing creates new statement versions." run={reopenPeriodAction.bind(null, p.period)} />
                  )}
                  {p.status === "REOPENED" && (
                    <ReasonButton label="Re-close" title={`Re-close ${p.period}?`} danger={false} requireReason={false} run={closePeriodAction.bind(null, p.period)} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
