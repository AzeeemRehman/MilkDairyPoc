import { formatDate } from "@/lib/dates";
import { formatExact, formatMoney, formatNumber, type DisplaySettings } from "@/lib/format";
import type { QtyTotals, SheetRow } from "@/server/services/statements";

/** Bandhi table in the reference-sheet layout. */
export function BandhiSheet({ title, rows, totals, s }: { title: string; rows: SheetRow[]; totals: QtyTotals; s: DisplaySettings }) {
  return (
    <div className="overflow-x-auto">
      <table className="sheet w-full border-collapse text-sm">
        <thead>
          <tr>
            <th colSpan={8} className="bg-brand-800! text-white!">
              {title} — BANDHI
            </th>
          </tr>
          <tr>
            <th rowSpan={2}>Date</th>
            <th colSpan={2}>Morning</th>
            <th colSpan={2}>Evening</th>
            <th rowSpan={2}>Rate/Maan</th>
            <th rowSpan={2}>Rate/KG</th>
            <th rowSpan={2}>Amount</th>
          </tr>
          <tr>
            <th>Maan</th>
            <th>KG</th>
            <th>Maan</th>
            <th>KG</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.entryId}>
              <td>{formatDate(r.date)}</td>
              <td className="num">{r.morning?.maan ?? "0"}</td>
              <td className="num">{r.morning?.kg ?? "0"}</td>
              <td className="num">{r.evening?.maan ?? "0"}</td>
              <td className="num">{r.evening?.kg ?? "0"}</td>
              <td className="num">{formatNumber(r.morning?.ratePerMaan ?? r.evening?.ratePerMaan ?? 0, 0, s.grouping)}</td>
              <td className="num">{r.morning?.ratePerKg ?? r.evening?.ratePerKg ?? ""}</td>
              <td className="num">{formatExact(r.total, s.grouping)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={8} className="py-3 text-center text-slate-500">
                No Bandhi supply in this period
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="font-semibold">
            <td />
            <td className="num">{totals.MORNING.maan}</td>
            <td className="num">{totals.MORNING.kg}</td>
            <td className="num">{totals.EVENING.maan}</td>
            <td className="num">{totals.EVENING.kg}</td>
            <td colSpan={2} />
            <td className="num bg-green-100">{formatMoney(totals.amount, s, true)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** Mandi table: separate morning / evening rate columns. */
export function MandiSheet({ title, rows, totals, s }: { title: string; rows: SheetRow[]; totals: QtyTotals; s: DisplaySettings }) {
  return (
    <div className="overflow-x-auto">
      <table className="sheet w-full border-collapse text-sm">
        <thead>
          <tr>
            <th colSpan={10} className="bg-pink-800! text-white!">
              {title} — MANDI
            </th>
          </tr>
          <tr>
            <th rowSpan={2}>Date</th>
            <th colSpan={2}>Morning</th>
            <th colSpan={2}>Evening</th>
            <th rowSpan={2}>Rate/Maan (M)</th>
            <th rowSpan={2}>Rate/KG (M)</th>
            <th rowSpan={2}>Rate/Maan (E)</th>
            <th rowSpan={2}>Rate/KG (E)</th>
            <th rowSpan={2}>Amount</th>
          </tr>
          <tr>
            <th>Maan</th>
            <th>KG</th>
            <th>Maan</th>
            <th>KG</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.entryId}>
              <td>{formatDate(r.date)}</td>
              <td className="num">{r.morning?.maan ?? "0"}</td>
              <td className="num">{r.morning?.kg ?? "0"}</td>
              <td className="num">{r.evening?.maan ?? "0"}</td>
              <td className="num">{r.evening?.kg ?? "0"}</td>
              <td className="num">{r.morning ? formatNumber(r.morning.ratePerMaan, 0, s.grouping) : ""}</td>
              <td className="num">{r.morning?.ratePerKg ?? ""}</td>
              <td className="num">{r.evening ? formatNumber(r.evening.ratePerMaan, 0, s.grouping) : ""}</td>
              <td className="num">{r.evening?.ratePerKg ?? ""}</td>
              <td className="num">{formatExact(r.total, s.grouping)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={10} className="py-3 text-center text-slate-500">
                No Mandi supply in this period
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="font-semibold">
            <td />
            <td className="num">{totals.MORNING.maan}</td>
            <td className="num">{totals.MORNING.kg}</td>
            <td className="num">{totals.EVENING.maan}</td>
            <td className="num">{totals.EVENING.kg}</td>
            <td colSpan={4} />
            <td className="num bg-green-100">{formatMoney(totals.amount, s, true)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
