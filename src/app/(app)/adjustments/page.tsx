import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate, todayIso } from "@/lib/dates";
import { formatExact } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions";
import { ActionForm } from "@/components/ActionForm";
import { ReasonButton } from "@/components/ReasonButton";
import { Badge, Card, CustomerOptions, Field, PageHeader } from "@/components/ui";
import { ADJUSTMENT_LABEL, ADJUSTMENT_SIDE, listAdjustments } from "@/server/services/adjustments";
import { createAdjustmentAction, voidAdjustmentAction } from "@/app/actions/finance";

export const metadata = { title: "Adjustments" };

export default async function AdjustmentsPage({ searchParams }: { searchParams: Promise<{ customerId?: string }> }) {
  await requirePage(PERMISSIONS.ADJUSTMENTS_MANAGE);
  const sp = await searchParams;
  const [customers, list] = await Promise.all([
    prisma.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }),
    listAdjustments({ customerId: sp.customerId || undefined }),
  ]);
  return (
    <>
      <PageHeader title="Adjustments" subtitle="Additional charges, discounts, refunds and debit/credit corrections. Each posts one ledger line." />
      <Card title="New adjustment" className="mb-6">
        <ActionForm action={createAdjustmentAction} resetOnSuccess submitLabel="Post adjustment">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Field label="Customer *" className="sm:col-span-2">
              <select name="customerId" className="input" defaultValue={sp.customerId ?? ""} required>
                <option value="">Select…</option>
                <CustomerOptions customers={customers} />
              </select>
            </Field>
            <Field label="Date *">
              <input type="date" name="adjDate" className="input" defaultValue={todayIso()} required />
            </Field>
            <Field label="Type *">
              <select name="type" className="input">
                {Object.entries(ADJUSTMENT_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v} ({ADJUSTMENT_SIDE[k as keyof typeof ADJUSTMENT_SIDE] === "DEBIT" ? "+ owed" : "− owed"})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Amount *">
              <input name="amount" className="input text-right" inputMode="decimal" required />
            </Field>
            <Field label="Reason *" className="sm:col-span-3 lg:col-span-5">
              <input name="reason" className="input" required />
            </Field>
          </div>
        </ActionForm>
      </Card>
      <Card title="Recent adjustments" className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Customer</th>
              <th>Type</th>
              <th>Reason</th>
              <th className="text-right">Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((a) => (
              <tr key={a.id} className={a.voidedAt ? "text-slate-400" : ""}>
                <td>{formatDate(a.adjDate)}</td>
                <td>{a.customer.name}</td>
                <td>
                  <Badge tone={ADJUSTMENT_SIDE[a.type] === "DEBIT" ? "red" : "green"}>{ADJUSTMENT_LABEL[a.type]}</Badge> {a.voidedAt && <Badge>Voided</Badge>}
                </td>
                <td>{a.reason}</td>
                <td className="num">{formatExact(a.amount)}</td>
                <td className="text-right">{!a.voidedAt && <ReasonButton label="Void" title="Void this adjustment?" run={voidAdjustmentAction.bind(null, a.id)} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
