import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { dec } from "@/lib/calc";
import { prisma } from "@/lib/db";
import { formatDate, parseDate, todayIso } from "@/lib/dates";
import { formatExact, formatMoney } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { Badge, Card, PageHeader } from "@/components/ui";
import { ReasonButton } from "@/components/ReasonButton";
import { listEntries } from "@/server/services/milkEntries";
import { voidEntryAction } from "@/app/actions/entries";
import { EntryForm } from "./EntryForm";

export const metadata = { title: "Daily milk entry" };

export default async function EntriesPage({ searchParams }: { searchParams: Promise<{ date?: string; customerId?: string }> }) {
  const user = await requirePage(PERMISSIONS.MILK_ENTRY);
  const sp = await searchParams;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayIso();
  const [customers, entries, s] = await Promise.all([
    prisma.customer.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, code: true, customerType: true }, orderBy: { name: "asc" } }),
    listEntries({ date: parseDate(date) }),
    getSettings(),
  ]);
  const total = entries.reduce((a, e) => a.plus(dec(e.totalAmount)), dec(0));
  const canEditPast = user.permissions.has(PERMISSIONS.MILK_EDIT_PAST);
  const isToday = date === todayIso();

  return (
    <>
      <PageHeader
        title="Daily milk entry"
        subtitle="Enter moves to the next field · Ctrl+S saves"
        actions={
          <Link href={`/entries/bulk?date=${date}`} className="btn-secondary">
            Bulk Bandhi entry
          </Link>
        }
      />
      <EntryForm
        customers={customers}
        initialDate={date}
        initialCustomerId={sp.customerId}
        canOverrideRate={user.permissions.has(PERMISSIONS.MILK_OVERRIDE_RATE)}
        canOverrideQty={user.permissions.has(PERMISSIONS.MILK_OVERRIDE_QTY)}
        display={s}
      />

      <Card
        className="mt-6 overflow-x-auto"
        title={`Entries on ${formatDate(date)} (${entries.length}) · ${formatMoney(total, s, true)}`}
        actions={
          <form className="flex gap-2" method="get">
            <input type="date" name="date" defaultValue={date} className="input py-1" />
            <button className="btn-secondary py-1">Show</button>
          </form>
        }
      >
        <table className="table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Type</th>
              <th className="text-right">Morning</th>
              <th className="text-right">Evening</th>
              <th className="text-right">Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const m = e.sessions.find((x) => x.session === "MORNING");
              const ev = e.sessions.find((x) => x.session === "EVENING");
              const fmt = (x: typeof m) => (x ? `${dec(x.maan)}-${dec(x.kg)} @ ${formatExact(x.ratePerMaan)}${x.rateOverridden ? " *" : ""}` : "—");
              return (
                <tr key={e.id}>
                  <td>{e.customer.name}</td>
                  <td>
                    <Badge tone={e.supplyType === "BANDHI" ? "green" : "blue"}>{e.supplyType}</Badge> {e.noSupply && <Badge>No supply</Badge>}
                  </td>
                  <td className="num">{fmt(m)}</td>
                  <td className="num">{fmt(ev)}</td>
                  <td className="num font-medium">{formatExact(e.totalAmount)}</td>
                  <td className="text-right whitespace-nowrap">
                    {(canEditPast || isToday) && (
                      <>
                        <Link href={`/entries/${e.id}`} className="mr-3 text-sm text-brand-800 hover:underline">
                          Edit
                        </Link>
                        <ReasonButton label="Void" title={`Void ${e.customer.name}'s ${e.supplyType} entry?`} description="A reversal is posted to the ledger. The entry stays visible in the audit trail." run={voidEntryAction.bind(null, e.id)} />
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {entries.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-500">
                  No entries for this date yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-slate-500">* rate overridden from the customer&apos;s default</p>
      </Card>
    </>
  );
}
