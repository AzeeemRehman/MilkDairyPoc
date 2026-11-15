import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { formatExact, formatMoney } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { PrintButton } from "@/components/PrintButton";
import { Badge } from "@/components/ui";
import { balance } from "@/server/services/ledger";
import { getPayment } from "@/server/services/payments";

/** Printable receipt (browser Print → Save as PDF). */
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePage(PERMISSIONS.STATEMENTS_VIEW);
  const { id } = await params;
  const [p, s] = await Promise.all([getPayment(id), getSettings()]);
  const bal = await balance(prisma, p.customerId, { asOf: p.paymentDate });

  return (
    <div className="mx-auto max-w-xl">
      <div className="no-print mb-4 flex justify-end">
        <PrintButton label="Print receipt" />
      </div>
      <div className="card p-8">
        <div className="text-center">
          <h1 className="text-xl font-bold">{s.businessName}</h1>
          {s.address && <p className="text-sm text-slate-600">{s.address}</p>}
          {s.phone && <p className="text-sm text-slate-600">{s.phone}</p>}
          <h2 className="mt-4 text-lg font-semibold tracking-wide uppercase">Payment receipt</h2>
          {p.voidedAt && <Badge tone="red">VOIDED — {p.voidReason}</Badge>}
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-slate-500">Receipt no.</dt>
          <dd className="text-right font-medium">{p.receiptNo}</dd>
          <dt className="text-slate-500">Date</dt>
          <dd className="text-right">{formatDate(p.paymentDate)}</dd>
          <dt className="text-slate-500">Received from</dt>
          <dd className="text-right">
            {p.customer.name} ({p.customer.code})
          </dd>
          <dt className="text-slate-500">Method</dt>
          <dd className="text-right">
            {p.method}
            {p.reference && ` · ${p.reference}`}
          </dd>
          {p.notes && (
            <>
              <dt className="text-slate-500">Notes</dt>
              <dd className="text-right">{p.notes}</dd>
            </>
          )}
        </dl>
        <div className="mt-6 rounded-md bg-green-50 p-4 text-center">
          <div className="text-sm text-slate-600">Amount received</div>
          <div className="text-3xl font-bold text-green-800 tabular-nums">{formatMoney(p.amount, s, true)}</div>
          <div className="text-xs text-slate-500">({formatExact(p.amount)})</div>
        </div>
        {p.allocations.length > 0 && (
          <div className="mt-4 text-sm">
            <div className="font-medium">Applied to</div>
            <ul className="mt-1 space-y-1">
              {p.allocations.map((a) => (
                <li key={a.id} className="flex justify-between">
                  <span>{a.statement ? `Statement ${a.statement.statementNo} (${a.statement.period})` : "Opening balance"}</span>
                  <span className="tabular-nums">{formatMoney(a.amount, s)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-4 flex justify-between border-t border-slate-200 pt-3 text-sm">
          <span>Balance after this payment (as of {formatDate(p.paymentDate)})</span>
          <span className={`font-semibold tabular-nums ${bal.gt(0) ? "text-red-700" : "text-green-700"}`}>{formatMoney(bal, s, true)}</span>
        </div>
        <div className="mt-16 grid grid-cols-2 gap-8 text-center text-xs text-slate-500">
          <div className="border-t border-slate-400 pt-1">Received by</div>
          <div className="border-t border-slate-400 pt-1">Customer signature</div>
        </div>
      </div>
    </div>
  );
}
