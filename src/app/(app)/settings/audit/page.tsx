import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ entity?: string; action?: string; page?: string }> }) {
  await requirePage(PERMISSIONS.AUDIT_VIEW);
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where = { entityType: sp.entity || undefined, action: sp.action || undefined };
  const [rows, users, entities] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 100, skip: (page - 1) * 100 }),
    prisma.user.findMany({ select: { id: true, name: true } }),
    prisma.auditLog.findMany({ select: { entityType: true }, distinct: ["entityType"] }),
  ]);
  const names = new Map(users.map((u) => [u.id, u.name]));
  return (
    <>
      <PageHeader title="Audit log" subtitle="Every financial change, login, close/reopen, settings and user change." />
      <form method="get" className="card mb-4 flex flex-wrap gap-2 p-4">
        <select name="entity" defaultValue={sp.entity ?? ""} className="input w-auto">
          <option value="">All entities</option>
          {entities.map((e) => (
            <option key={e.entityType}>{e.entityType}</option>
          ))}
        </select>
        <input name="action" placeholder="Action (e.g. VOID)" defaultValue={sp.action} className="input w-auto" />
        <button className="btn-secondary">Filter</button>
      </form>
      <Card className="overflow-x-auto">
        <table className="table text-xs">
          <thead>
            <tr>
              <th>When</th>
              <th>User</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Reason</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="whitespace-nowrap">{r.createdAt.toLocaleString("en-GB", { timeZone: "Asia/Karachi" })}</td>
                <td>{names.get(r.userId ?? "") ?? "—"}</td>
                <td className="font-medium">{r.action}</td>
                <td>
                  {r.entityType} <span className="text-slate-400">{r.entityId?.slice(-8)}</span>
                </td>
                <td>{r.reason}</td>
                <td>
                  {(r.oldValues || r.newValues) && (
                    <details>
                      <summary className="cursor-pointer text-brand-800">view</summary>
                      <pre className="max-w-xl overflow-x-auto bg-slate-50 p-2 whitespace-pre-wrap">{JSON.stringify({ old: r.oldValues, new: r.newValues }, null, 1)}</pre>
                    </details>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex gap-3 text-sm">
          {page > 1 && <a href={`?${new URLSearchParams({ ...sp, page: String(page - 1) } as Record<string, string>)}`}>← Newer</a>}
          {rows.length === 100 && <a href={`?${new URLSearchParams({ ...sp, page: String(page + 1) } as Record<string, string>)}`}>Older →</a>}
        </div>
      </Card>
    </>
  );
}
