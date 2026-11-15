"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dailyAmount, sum } from "@/lib/calc";
import { formatExact } from "@/lib/format";
import { bulkSaveAction } from "@/app/actions/entries";

interface S {
  maan: string;
  kg: string;
  ratePerMaan: string;
  ratePerKg: string;
}
export interface GridRow {
  customerId: string;
  code: string;
  name: string;
  defaults: { MORNING?: S; EVENING?: S };
  existingId: string | null;
  existingAmount: string | null;
}

interface RowState {
  include: boolean;
  noSupply: boolean;
  mMaan: string;
  mKg: string;
  eMaan: string;
  eKg: string;
}

export function BulkGrid({ rows, date, canOverrideQty }: { rows: GridRow[]; date: string; canOverrideQty: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(
      rows.map((r) => [
        r.customerId,
        {
          include: !r.existingId && !!(r.defaults.MORNING || r.defaults.EVENING),
          noSupply: false,
          mMaan: r.defaults.MORNING?.maan ?? "0",
          mKg: r.defaults.MORNING?.kg ?? "0",
          eMaan: r.defaults.EVENING?.maan ?? "0",
          eKg: r.defaults.EVENING?.kg ?? "0",
        },
      ]),
    ),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const amount = (r: GridRow) => {
    const st = state[r.customerId];
    if (st.noSupply) return "0";
    try {
      return dailyAmount(
        r.defaults.MORNING ? { maan: st.mMaan || 0, kg: st.mKg || 0, ratePerMaan: r.defaults.MORNING.ratePerMaan, ratePerKg: r.defaults.MORNING.ratePerKg } : null,
        r.defaults.EVENING ? { maan: st.eMaan || 0, kg: st.eKg || 0, ratePerMaan: r.defaults.EVENING.ratePerMaan, ratePerKg: r.defaults.EVENING.ratePerKg } : null,
      ).toFixed(2);
    } catch {
      return null;
    }
  };
  const total = useMemo(() => sum(rows.filter((r) => state[r.customerId].include).map((r) => amount(r) ?? 0)), [rows, state]); // eslint-disable-line react-hooks/exhaustive-deps

  const upd = (id: string, patch: Partial<RowState>) => setState((s) => ({ ...s, [id]: { ...s[id], ...patch } }));

  const save = () =>
    start(async () => {
      const payload = rows
        .filter((r) => state[r.customerId].include)
        .map((r) => {
          const st = state[r.customerId];
          return {
            customerId: r.customerId,
            entryDate: date,
            supplyType: "BANDHI" as const,
            noSupply: st.noSupply,
            morning: r.defaults.MORNING ? { maan: st.mMaan, kg: st.mKg, ratePerMaan: r.defaults.MORNING.ratePerMaan, ratePerKg: r.defaults.MORNING.ratePerKg } : undefined,
            evening: r.defaults.EVENING ? { maan: st.eMaan, kg: st.eKg, ratePerMaan: r.defaults.EVENING.ratePerMaan, ratePerKg: r.defaults.EVENING.ratePerKg } : undefined,
          };
        });
      if (!payload.length) {
        setMsg({ ok: false, text: "No rows selected." });
        return;
      }
      const r = await bulkSaveAction(payload);
      setMsg({ ok: r.ok, text: r.message ?? "" });
      const errs: Record<string, string> = {};
      for (const x of r.data?.results ?? []) if (!x.ok && x.message) errs[x.customerId] = x.message;
      setErrors(errs);
      if (r.ok) router.refresh();
    });

  const qtyInput = (id: string, key: keyof RowState, disabled: boolean) => (
    <input
      className="input w-16 px-2 py-1 text-right"
      inputMode="decimal"
      value={state[id][key] as string}
      disabled={disabled || !canOverrideQty}
      onFocus={(e) => e.target.select()}
      onChange={(e) => upd(id, { [key]: e.target.value })}
    />
  );

  return (
    <div className="card overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                aria-label="Select all"
                checked={rows.every((r) => state[r.customerId].include || r.existingId)}
                onChange={(e) => setState((s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, { ...v, include: e.target.checked && !rows.find((r) => r.customerId === k)?.existingId }])))}
              />
            </th>
            <th>Customer</th>
            <th className="text-center">Morning Maan / KG</th>
            <th className="text-center">Evening Maan / KG</th>
            <th>No supply</th>
            <th className="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const st = state[r.customerId];
            const noRate = !r.defaults.MORNING && !r.defaults.EVENING;
            return (
              <tr key={r.customerId} className={errors[r.customerId] ? "bg-red-50" : r.existingId ? "bg-slate-50 text-slate-500" : ""}>
                <td>
                  <input type="checkbox" checked={st.include} disabled={!!r.existingId || noRate} onChange={(e) => upd(r.customerId, { include: e.target.checked })} />
                </td>
                <td>
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs">
                    {r.code}
                    {r.existingId && (
                      <>
                        {" "}
                        · already entered ({formatExact(r.existingAmount)}) ·{" "}
                        <Link href={`/entries/${r.existingId}`} className="underline">
                          edit
                        </Link>
                      </>
                    )}
                    {noRate && (
                      <>
                        {" "}
                        · <Link href={`/customers/${r.customerId}?tab=rates`} className="text-red-700 underline">no rate set</Link>
                      </>
                    )}
                  </div>
                  {errors[r.customerId] && <div className="text-xs text-red-700">{errors[r.customerId]}</div>}
                </td>
                <td className="text-center whitespace-nowrap">
                  {qtyInput(r.customerId, "mMaan", !r.defaults.MORNING || st.noSupply || !!r.existingId)} {qtyInput(r.customerId, "mKg", !r.defaults.MORNING || st.noSupply || !!r.existingId)}
                </td>
                <td className="text-center whitespace-nowrap">
                  {qtyInput(r.customerId, "eMaan", !r.defaults.EVENING || st.noSupply || !!r.existingId)} {qtyInput(r.customerId, "eKg", !r.defaults.EVENING || st.noSupply || !!r.existingId)}
                </td>
                <td>
                  <input type="checkbox" checked={st.noSupply} disabled={!!r.existingId} onChange={(e) => upd(r.customerId, { noSupply: e.target.checked })} />
                </td>
                <td className="num">{st.include ? formatExact(amount(r)) : ""}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={5}>Total of selected rows</td>
            <td className="num">{formatExact(total)}</td>
          </tr>
        </tfoot>
      </table>
      <div className="flex items-center gap-3 p-4">
        <button className="btn-primary" disabled={pending} onClick={save}>
          {pending ? "Saving…" : "Save all selected"}
        </button>
        {msg && <span className={`text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</span>}
        <span className="ml-auto text-xs text-slate-500">All-or-nothing: if any row fails, nothing is saved.</span>
      </div>
    </div>
  );
}
