import { requirePage } from "@/lib/auth";
import { formatDate, parseDate, todayIso } from "@/lib/dates";
import { PERMISSIONS } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";
import { bulkGrid } from "@/server/services/milkEntries";
import { BulkGrid } from "./BulkGrid";

export const metadata = { title: "Bulk Bandhi entry" };

export default async function BulkPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await requirePage(PERMISSIONS.MILK_ENTRY);
  const sp = await searchParams;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayIso();
  const rows = await bulkGrid(parseDate(date));
  return (
    <>
      <PageHeader
        title="Bulk Bandhi entry"
        subtitle={`All active Bandhi customers for ${formatDate(date)}, pre-filled with their default quantities and rates. Adjust the exceptions and save.`}
        actions={
          <form method="get" className="flex gap-2">
            <input type="date" name="date" defaultValue={date} className="input" />
            <button className="btn-secondary">Load</button>
          </form>
        }
      />
      <BulkGrid key={date} rows={rows} date={date} canOverrideQty={user.permissions.has(PERMISSIONS.MILK_OVERRIDE_QTY)} />
    </>
  );
}
