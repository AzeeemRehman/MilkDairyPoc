import { requirePage } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Backup" };

export default async function BackupPage() {
  await requirePage(PERMISSIONS.BACKUP_MANAGE);
  return (
    <>
      <PageHeader title="Backup" />
      <Card title="Download a backup now" className="mb-6">
        <p className="mb-3 text-sm text-slate-600">Creates a full PostgreSQL dump (pg_dump custom format) of all data. Keep it somewhere safe; it contains every customer and financial record.</p>
        <a href="/api/v1/backup" className="btn-primary">
          Download backup (.dump)
        </a>
      </Card>
      <Card title="Automatic backups and restore">
        <ul className="list-inside list-disc space-y-1 text-sm text-slate-700">
          <li>
            With Docker Compose (<code>--profile app</code>) the <code>backup</code> service writes a dump to <code>./backups</code> every night and keeps 30 days.
          </li>
          <li>
            Restore is done from the server command line, after taking a fresh backup:
            <pre className="mt-1 rounded bg-slate-100 p-2 text-xs">pg_restore --clean --if-exists -d dairy backups/dairy-YYYYMMDD-HHMM.dump</pre>
          </li>
        </ul>
      </Card>
    </>
  );
}
