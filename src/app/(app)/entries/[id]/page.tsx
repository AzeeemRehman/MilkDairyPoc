import { requirePage } from "@/lib/auth";
import { dec } from "@/lib/calc";
import { prisma } from "@/lib/db";
import { formatDate, isoDate } from "@/lib/dates";
import { PERMISSIONS } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { Badge, Card, PageHeader } from "@/components/ui";
import { getEntry } from "@/server/services/milkEntries";
import { EntryForm } from "../EntryForm";

export default async function EditEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage(PERMISSIONS.MILK_VIEW);
  const { id } = await params;
  const [e, s] = await Promise.all([getEntry(id), getSettings()]);
  const history = await prisma.auditLog.findMany({ where: { entityType: "MilkEntry", entityId: id }, orderBy: { createdAt: "desc" } });
  const users = new Map((await prisma.user.findMany({ select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const pick = (s: "MORNING" | "EVENING") => {
    const x = e.sessions.find((y) => y.session === s);
    return x ? { maan: dec(x.maan).toString(), kg: dec(x.kg).toString(), ratePerMaan: dec(x.ratePerMaan).toString(), ratePerKg: dec(x.ratePerKg).toString() } : null;
  };
  const canEdit = user.permissions.has(PERMISSIONS.MILK_ENTRY) && !e.voidedAt;

  return (
    <>
      <PageHeader
        title={`${e.supplyType === "BANDHI" ? "Bandhi" : "Mandi"} entry · ${e.customer.name}`}
        subtitle={
          <>
            {formatDate(e.entryDate)} {e.voidedAt && <Badge tone="red">Voided: {e.voidReason}</Badge>}
          </>
        }
      />
      {canEdit ? (
        <EntryForm
          customers={[{ id: e.customer.id, name: e.customer.name, code: e.customer.code, customerType: e.customer.customerType }]}
          initialDate={isoDate(e.entryDate)}
          canOverrideRate={user.permissions.has(PERMISSIONS.MILK_OVERRIDE_RATE)}
          canOverrideQty={user.permissions.has(PERMISSIONS.MILK_OVERRIDE_QTY)}
          display={s}
          edit={{ id: e.id, customerId: e.customerId, date: isoDate(e.entryDate), supplyType: e.supplyType, noSupply: e.noSupply, notes: e.notes ?? "", morning: pick("MORNING"), evening: pick("EVENING") }}
        />
      ) : (
        <Card>
          <p className="text-sm text-slate-600">This entry cannot be edited.</p>
        </Card>
      )}
      <Card title="Change history" className="mt-6">
        <ul className="space-y-2 text-sm">
          {history.map((h) => (
            <li key={h.id}>
              <span className="text-slate-500">{h.createdAt.toLocaleString("en-GB", { timeZone: "Asia/Karachi" })}</span> · <b>{h.action}</b> by {users.get(h.userId ?? "") ?? "system"}
              {h.reason && <> — “{h.reason}”</>}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
