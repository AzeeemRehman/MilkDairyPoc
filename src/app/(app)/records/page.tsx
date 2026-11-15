import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatPeriod, isValidPeriod, periodOf, periodRange, today } from "@/lib/dates";
import { PERMISSIONS } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { CustomerOptions, Empty, PageHeader } from "@/components/ui";
import { BandhiSheet, MandiSheet } from "@/components/SheetTables";
import { PrintButton } from "@/components/PrintButton";
import { sheetRows } from "@/server/services/statements";

export const metadata = { title: "Bandhi / Mandi records" };

export default async function RecordsPage({ searchParams }: { searchParams: Promise<{ customerId?: string; period?: string; type?: string }> }) {
  await requirePage(PERMISSIONS.MILK_VIEW);
  const sp = await searchParams;
  const period = sp.period && isValidPeriod(sp.period) ? sp.period : periodOf(today());
  const type = sp.type === "MANDI" ? "MANDI" : sp.type === "BANDHI" ? "BANDHI" : "BOTH";
  const [customers, s] = await Promise.all([prisma.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }), getSettings()]);
  const customer = sp.customerId ? customers.find((c) => c.id === sp.customerId) : undefined;
  const { start, end } = periodRange(period);
  const [bandhi, mandi] = customer
    ? await Promise.all([sheetRows(prisma, customer.id, "BANDHI", start, end), sheetRows(prisma, customer.id, "MANDI", start, end)])
    : [null, null];

  return (
    <>
      <PageHeader title="Bandhi / Mandi records" subtitle="Per customer and month, in the sheet layout." actions={customer && <PrintButton />} />
      <form method="get" className="no-print card mb-4 grid gap-3 p-4 sm:grid-cols-4">
        <select name="customerId" defaultValue={sp.customerId ?? ""} className="input sm:col-span-2" required>
          <option value="">Select customer…</option>
          <CustomerOptions customers={customers} />
        </select>
        <input type="month" name="period" defaultValue={period} className="input" />
        <div className="flex gap-2">
          <select name="type" defaultValue={type} className="input">
            <option value="BOTH">Bandhi + Mandi</option>
            <option value="BANDHI">Bandhi</option>
            <option value="MANDI">Mandi</option>
          </select>
          <button className="btn-primary">Show</button>
        </div>
      </form>
      {!customer && <Empty>Choose a customer and month.</Empty>}
      {customer && (
        <div className="space-y-6">
          <h2 className="text-center text-lg font-semibold">
            {s.businessName} · {customer.name} · {formatPeriod(period)}
          </h2>
          {type !== "MANDI" && bandhi && <BandhiSheet title={customer.name} rows={bandhi.rows} totals={bandhi.totals} s={s} />}
          {type !== "BANDHI" && mandi && <MandiSheet title={customer.name} rows={mandi.rows} totals={mandi.totals} s={s} />}
        </div>
      )}
    </>
  );
}
