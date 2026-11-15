import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { formatDate, formatPeriod } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { Card, Money, PageHeader, Stat } from "@/components/ui";
import { dashboardData, milkDashboard } from "@/server/services/dashboard";
import { DashboardCharts } from "./DashboardCharts";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await requirePage();
  const s = await getSettings();

  if (!user.permissions.has(PERMISSIONS.DASHBOARD_VIEW)) {
    const m = await milkDashboard();
    return (
      <>
        <PageHeader title="Today" subtitle={formatDate(m.today)} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Bandhi entries today" value={`${m.bandhiDone} / ${m.bandhiCustomers}`} tone={m.bandhiDone >= m.bandhiCustomers ? "good" : "bad"} />
          <Stat label="Mandi entries today" value={m.mandiDone} />
        </div>
        <div className="mt-6 flex gap-2">
          <Link href="/entries" className="btn-primary">
            Daily entry
          </Link>
          <Link href="/entries/bulk" className="btn-secondary">
            Bulk Bandhi entry
          </Link>
        </div>
      </>
    );
  }

  const d = await dashboardData();
  const c = d.cards;
  return (
    <>
      <PageHeader title="Dashboard" subtitle={`${formatPeriod(d.period)} · today ${formatDate(d.today)}`} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Today's milk sales" value={<Money value={c.todaySales} s={s} />} hint={`${c.todayEntries} entries`} />
        <Stat label="Milk sales this month" value={<Money value={c.monthSales} s={s} />} hint={`Bandhi ${formatMoney(c.monthBandhi, s)} · Mandi ${formatMoney(c.monthMandi, s)}`} />
        <Stat label="Payments this month" value={<Money value={c.monthPayments} s={s} />} tone="good" />
        <Stat label="Expenses this month" value={<Money value={c.monthExpenses} s={s} />} />
        <Stat label="Profit this month" value={<Money value={c.monthProfit} s={s} />} tone={Number(c.monthProfit) >= 0 ? "good" : "bad"} hint="Milk sales − expenses (accrual)" />
        <Stat label="Total outstanding" value={<Money value={c.outstanding} s={s} />} tone="bad" />
        <Stat label="Customer advances" value={<Money value={c.advances} s={s} />} tone="good" />
        <Stat label="Active customers" value={c.activeCustomers} />
      </div>

      <DashboardCharts series={d.series} top={d.topOutstanding} />

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card title="Recent milk entries">
          <table className="table">
            <tbody>
              {d.recentEntries.map((e) => (
                <tr key={e.id}>
                  <td>{formatDate(e.date)}</td>
                  <td>{e.customer}</td>
                  <td className="text-xs text-slate-500">{e.type}</td>
                  <td className="num">{formatMoney(e.amount, s)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Recent payments">
          <table className="table">
            <tbody>
              {d.recentPayments.map((p) => (
                <tr key={p.id}>
                  <td>{formatDate(p.date)}</td>
                  <td>{p.customer}</td>
                  <td className="num text-green-700">{formatMoney(p.amount, s)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Recent expenses">
          <table className="table">
            <tbody>
              {d.recentExpenses.map((e) => (
                <tr key={e.id}>
                  <td>{formatDate(e.date)}</td>
                  <td>{e.category}</td>
                  <td className="num">{formatMoney(e.amount, s)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
