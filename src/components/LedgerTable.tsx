import Link from "next/link";
import { formatDate } from "@/lib/dates";
import { formatExact, formatMoney, type DisplaySettings } from "@/lib/format";
import type { getLedger } from "@/server/services/ledger";
import { Badge, Money } from "./ui";

type Ledger = Awaited<ReturnType<typeof getLedger>>;

const sourceLink = (type: string, id: string, customerId: string) => {
  switch (type) {
    case "MILK_ENTRY":
      return `/entries/${id}`;
    case "PAYMENT":
      return `/payments/${id}`;
    case "ADJUSTMENT":
      return `/adjustments`;
    default:
      return `/customers/${customerId}`;
  }
};

export function LedgerTable({ ledger, s, customerId }: { ledger: Ledger; s: DisplaySettings; customerId: string }) {
  return (
    <div className="card overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Txn #</th>
            <th>Description</th>
            <th className="text-right">Debit</th>
            <th className="text-right">Credit</th>
            <th className="text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          <tr className="bg-slate-50">
            <td colSpan={5} className="font-medium">
              Opening balance
            </td>
            <td className="num font-medium">
              <Money value={ledger.opening} s={s} colored />
            </td>
          </tr>
          {ledger.rows.map((r) => (
            <tr key={r.id} className={r.isActive ? "" : "text-slate-400"}>
              <td className="whitespace-nowrap">{formatDate(r.txnDate)}</td>
              <td className="text-xs whitespace-nowrap">
                <Link href={sourceLink(r.sourceType, r.sourceId, customerId)} className="hover:underline">
                  {r.txnNo}
                </Link>
              </td>
              <td>
                {r.isReversal && (
                  <Badge tone="amber">
                    Reversal
                  </Badge>
                )}{" "}
                {!r.isActive && !r.isReversal && <Badge>Reversed</Badge>} {r.description}
              </td>
              <td className="num">{Number(r.debit) ? formatExact(r.debit, s.grouping) : ""}</td>
              <td className="num">{Number(r.credit) ? formatExact(r.credit, s.grouping) : ""}</td>
              <td className="num">
                <Money value={r.balance} s={s} colored />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3}>Totals / closing balance</td>
            <td className="num">{formatExact(ledger.totalDebit, s.grouping)}</td>
            <td className="num">{formatExact(ledger.totalCredit, s.grouping)}</td>
            <td className="num">
              <Money value={ledger.closing} s={s} colored />
            </td>
          </tr>
        </tfoot>
      </table>
      <p className="px-4 py-2 text-xs text-slate-500">
        Positive balance (red) is owed by the customer; negative (green) is an advance. Closing displays as {formatMoney(ledger.closing, s, true)}.
      </p>
    </div>
  );
}
