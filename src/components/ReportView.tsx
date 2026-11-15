import { formatDate } from "@/lib/dates";
import { formatExact, formatMoney, formatNumber, formatQty, type DisplaySettings } from "@/lib/format";
import type { Cell, Column, Report } from "@/server/services/reports";

function render(c: Column, v: Cell, s: DisplaySettings) {
  if (v === null || v === undefined || v === "") return "";
  switch (c.type) {
    case "money":
      return formatMoney(v, s);
    case "qty":
      return formatQty(v);
    case "number":
      return formatNumber(v, String(v).includes(".") ? String(v).split(".")[1].replace(/0+$/, "").length : 0, s.grouping);
    case "date":
      return formatDate(String(v));
    default:
      return String(v);
  }
}

export function ReportView({ report, s, exact = false }: { report: Report; s: DisplaySettings; exact?: boolean }) {
  const disp: DisplaySettings = exact ? { ...s, rounding: "PAISA" } : s;
  return (
    <div className="space-y-6">
      {report.sections.map((sec) => (
        <section key={sec.title} className="card overflow-x-auto">
          <h3 className="border-b border-slate-100 px-4 py-2 text-sm font-semibold">{sec.title}</h3>
          <table className="table">
            <thead>
              <tr>
                {sec.columns.map((c) => (
                  <th key={c.key} className={c.type === "text" || c.type === "date" ? "" : "text-right"}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sec.rows.length === 0 && (
                <tr>
                  <td colSpan={sec.columns.length} className="py-6 text-center text-slate-500">
                    No data
                  </td>
                </tr>
              )}
              {sec.rows.map((r, i) => (
                <tr key={i}>
                  {sec.columns.map((c) => (
                    <td key={c.key} className={c.type === "text" || c.type === "date" ? "" : "num"}>
                      {render(c, r[c.key], disp)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {sec.totals && sec.rows.length > 0 && (
              <tfoot>
                <tr>
                  {sec.columns.map((c, i) => (
                    <td key={c.key} className={c.type === "text" || c.type === "date" ? "" : "num"}>
                      {i === 0 ? "Total" : render(c, sec.totals![c.key] ?? null, disp)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </section>
      ))}
      {exact && <p className="text-xs text-slate-500">Amounts shown exactly to the paisa ({formatExact(0)} format).</p>}
    </div>
  );
}
