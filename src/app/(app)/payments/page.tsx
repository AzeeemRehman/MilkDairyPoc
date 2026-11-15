import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate, isoDate, parseDate, periodOf, periodRange, today, todayIso } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { ActionForm } from "@/components/ActionForm";
import { ReasonButton } from "@/components/ReasonButton";
import { Badge, Card, CustomerOptions, Field, PageHeader } from "@/components/ui";
import { listPayments } from "@/server/services/payments";
import { recordPaymentAction, voidPaymentAction } from "@/app/actions/finance";

export const metadata = { title: "Payments" };
const METHODS = ["CASH", "BANK", "JAZZCASH", "EASYPAISA", "OTHER"];
const ok = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ customerId?: string; from?: string; to?: string; method?: string }> }) {
  await requirePage(PERMISSIONS.PAYMENTS_MANAGE);
  const sp = await searchParams;
  const from = ok(sp.from) ? sp.from! : isoDate(periodRange(periodOf(today())).start);
  const to = ok(sp.to) ? sp.to! : todayIso();
  const [customers, payments, s] = await Promise.all([
    prisma.customer.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }),
    listPayments({ customerId: sp.customerId || undefined, from: parseDate(from), to: parseDate(to), method: sp.method || undefined, includeVoided: true }),
    getSettings(),
  ]);
  const total = payments.filter((p) => !p.voidedAt).reduce((a, p) => a + Number(p.amount), 0);

  return (
    <>
      <PageHeader title="Payments" subtitle="Payments reduce the balance immediately and are allocated FIFO to the oldest unpaid statement." />
      <Card title="Record a payment" className="mb-6">
        <ActionForm action={recordPaymentAction} resetOnSuccess submitLabel="Record payment">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Field label="Customer *" className="sm:col-span-2">
              <select name="customerId" className="input" defaultValue={sp.customerId ?? ""} required>
                <option value="">Select…</option>
                <CustomerOptions customers={customers} />
              </select>
            </Field>
            <Field label="Date *">
              <input type="date" name="paymentDate" className="input" defaultValue={todayIso()} required />
            </Field>
            <Field label="Amount *">
              <input name="amount" className="input text-right" inputMode="decimal" required />
            </Field>
            <Field label="Method">
              <select name="method" className="input">
                {METHODS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </Field>
            <Field label="Reference / cheque #">
              <input name="reference" className="input" />
            </Field>
            <Field label="Notes" className="sm:col-span-3 lg:col-span-6">
              <input name="notes" className="input" />
            </Field>
          </div>
        </ActionForm>
      </Card>

      <form method="get" className="card mb-4 grid gap-3 p-4 sm:grid-cols-5">
        <select name="customerId" defaultValue={sp.customerId ?? ""} className="input sm:col-span-2">
          <option value="">All customers</option>
          <CustomerOptions customers={customers} />
        </select>
        <input type="date" name="from" defaultValue={from} className="input" />
        <input type="date" name="to" defaultValue={to} className="input" />
        <div className="flex gap-2">
          <select name="method" defaultValue={sp.method ?? ""} className="input">
            <option value="">All methods</option>
            {METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <button className="btn-secondary">Filter</button>
        </div>
      </form>
      <Card title={`History · ${formatMoney(total, s, true)}`} className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Receipt</th>
              <th>Customer</th>
              <th>Method</th>
              <th>Allocated to</th>
              <th className="text-right">Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className={p.voidedAt ? "text-slate-400" : ""}>
                <td>{formatDate(p.paymentDate)}</td>
                <td>
                  <Link href={`/payments/${p.id}`} className="text-brand-800 hover:underline">
                    {p.receiptNo}
                  </Link>
                </td>
                <td>{p.customer.name}</td>
                <td>
                  {p.method} {p.reference && <span className="text-xs text-slate-500">{p.reference}</span>}
                </td>
                <td className="text-xs">{p.voidedAt ? <Badge tone="red">Voided</Badge> : p.allocations.map((a) => `${a.statement?.period ?? "Opening bal."}: ${formatMoney(a.amount, s)}`).join(", ") || <Badge tone="green">Advance</Badge>}</td>
                <td className="num font-medium">{formatMoney(p.amount, s)}</td>
                <td className="text-right">
                  {!p.voidedAt && <ReasonButton label="Void" title={`Void receipt ${p.receiptNo}?`} description="A reversal is posted and allocations are recalculated." run={voidPaymentAction.bind(null, p.id)} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
