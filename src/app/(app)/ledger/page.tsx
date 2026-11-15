import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate, isoDate, parseDate, periodOf, periodRange, today } from "@/lib/dates";
import { PERMISSIONS } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { CustomerOptions, Empty, PageHeader } from "@/components/ui";
import { LedgerTable } from "@/components/LedgerTable";
import { PrintButton } from "@/components/PrintButton";
import { getLedger } from "@/server/services/ledger";

export const metadata = { title: "Customer ledger" };

const ok = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function LedgerPage({ searchParams }: { searchParams: Promise<{ customerId?: string; from?: string; to?: string; showReversals?: string }> }) {
  await requirePage(PERMISSIONS.STATEMENTS_VIEW);
  const sp = await searchParams;
  const t = today();
  const from = ok(sp.from) ? sp.from! : isoDate(periodRange(periodOf(t)).start);
  const to = ok(sp.to) ? sp.to! : isoDate(t);
  const [customers, s] = await Promise.all([prisma.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }), getSettings()]);
  const customer = customers.find((c) => c.id === sp.customerId);
  const ledger = customer ? await getLedger(prisma, customer.id, parseDate(from), parseDate(to), sp.showReversals !== "1") : null;
  const q = new URLSearchParams({ customerId: sp.customerId ?? "", from, to }).toString();

  return (
    <>
      <PageHeader
        title="Customer ledger"
        subtitle={customer ? `${customer.name} · ${formatDate(from)} – ${formatDate(to)}` : undefined}
        actions={
          customer && (
            <>
              <a className="btn-secondary" href={`/api/v1/reports/ledger/xlsx?${q}`}>
                Excel
              </a>
              <PrintButton />
            </>
          )
        }
      />
      <form method="get" className="no-print card mb-4 grid gap-3 p-4 sm:grid-cols-5">
        <select name="customerId" defaultValue={sp.customerId ?? ""} className="input sm:col-span-2" required>
          <option value="">Select customer…</option>
          <CustomerOptions customers={customers} />
        </select>
        <input type="date" name="from" defaultValue={from} className="input" />
        <input type="date" name="to" defaultValue={to} className="input" />
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" name="showReversals" value="1" defaultChecked={sp.showReversals === "1"} /> Show reversals
          </label>
          <button className="btn-primary">Show</button>
        </div>
      </form>
      {ledger && customer ? <LedgerTable ledger={ledger} s={s} customerId={customer.id} /> : <Empty>Choose a customer.</Empty>}
    </>
  );
}
