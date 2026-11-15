"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dailyAmount, ratePerKgFromMaan, ratePerMaanFromKg, ratesMismatch, sessionAmount, toKg } from "@/lib/calc";
import { formatExact, formatMoney, type DisplaySettings } from "@/lib/format";
import { CustomerPicker, type PickerCustomer } from "@/components/CustomerPicker";
import { entryContextAction, saveEntryAction, type EntryContext } from "@/app/actions/entries";

type S = { maan: string; kg: string; ratePerMaan: string; ratePerKg: string };
const EMPTY: S = { maan: "0", kg: "0", ratePerMaan: "", ratePerKg: "" };
const safe = (s: S) => {
  try {
    return { ok: true, amt: sessionAmount({ maan: s.maan || 0, kg: s.kg || 0, ratePerMaan: s.ratePerMaan || 0, ratePerKg: s.ratePerKg || 0 }) };
  } catch {
    return { ok: false, amt: null };
  }
};

export interface EntryFormProps {
  customers: (PickerCustomer & { customerType: string })[];
  initialDate: string;
  initialCustomerId?: string;
  canOverrideRate: boolean;
  canOverrideQty: boolean;
  display: DisplaySettings;
  edit?: { id: string; customerId: string; date: string; supplyType: "BANDHI" | "MANDI"; noSupply: boolean; notes: string; morning: S | null; evening: S | null };
}

export function EntryForm(p: EntryFormProps) {
  const router = useRouter();
  const edit = p.edit;
  const [customerId, setCustomerId] = useState(edit?.customerId ?? p.initialCustomerId ?? "");
  const [date, setDate] = useState(edit?.date ?? p.initialDate);
  const [supplyType, setSupplyType] = useState<"BANDHI" | "MANDI">(edit?.supplyType ?? "BANDHI");
  const [morning, setMorning] = useState<S>(edit?.morning ?? EMPTY);
  const [evening, setEvening] = useState<S>(edit?.evening ?? EMPTY);
  const [noSupply, setNoSupply] = useState(edit?.noSupply ?? false);
  const [notes, setNotes] = useState(edit?.notes ?? "");
  const [reason, setReason] = useState("");
  const [ctx, setCtx] = useState<EntryContext | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const customer = p.customers.find((c) => c.id === customerId);

  // Supply type follows the customer's type.
  useEffect(() => {
    if (edit || !customer) return;
    if (customer.customerType === "MANDI") setSupplyType("MANDI");
    else if (customer.customerType === "BANDHI") setSupplyType("BANDHI");
  }, [customer, edit]);

  // Load defaults / duplicate check / previous day whenever the key changes.
  // Defaults never overwrite quantities the user typed while they were loading.
  const dirty = useRef(false);
  useEffect(() => {
    dirty.current = false;
    if (!edit) {
      // Clear the previous customer's/type's values right away so they can't be saved by mistake.
      setMorning(EMPTY);
      setEvening(EMPTY);
    }
    if (!customerId || !date) {
      setCtx(null);
      return;
    }
    let cancelled = false;
    entryContextAction(customerId, date, supplyType).then((c) => {
      if (cancelled || !c) return;
      setCtx(c);
      if (edit || dirty.current) return;
      const d = (s: "MORNING" | "EVENING"): S =>
        c.defaults[s] ? { ...c.defaults[s]! } : supplyType === "MANDI" ? { ...EMPTY, maan: "0", kg: "0" } : EMPTY;
      setMorning(d("MORNING"));
      setEvening(d("EVENING"));
    });
    return () => {
      cancelled = true;
    };
  }, [customerId, date, supplyType, edit]);

  const bandhiLocked = supplyType === "BANDHI";
  const rateDisabled = bandhiLocked && !p.canOverrideRate;
  const qtyDisabled = bandhiLocked && !p.canOverrideQty;

  const m = safe(morning);
  const e = safe(evening);
  const total = m.ok && e.ok && !noSupply ? dailyAmount({ maan: morning.maan || 0, kg: morning.kg || 0, ratePerMaan: morning.ratePerMaan || 0, ratePerKg: morning.ratePerKg || 0 }, { maan: evening.maan || 0, kg: evening.kg || 0, ratePerMaan: evening.ratePerMaan || 0, ratePerKg: evening.ratePerKg || 0 }) : null;

  const save = useCallback(() => {
    if (!customerId) {
      setMsg({ ok: false, text: "Select a customer." });
      return;
    }
    start(async () => {
      const input = { customerId, entryDate: date, supplyType, noSupply, notes, morning, evening };
      const r = await saveEntryAction(input, edit?.id, reason);
      setMsg({ ok: r.ok, text: r.ok ? `${r.message} Total ${formatExact(r.data!.total)}` : r.message ?? "Error" });
      if (!r.ok) return;
      if (edit) {
        router.push(`/entries?date=${date}`);
        return;
      }
      router.refresh();
      setCustomerId("");
      setNotes("");
      setNoSupply(false);
      setCtx(null);
      setTimeout(() => pickerRef.current?.focus(), 0);
    });
  }, [customerId, date, supplyType, noSupply, notes, morning, evening, edit, reason, router]);

  // Ctrl+S saves
  useEffect(() => {
    const h = (ev: KeyboardEvent) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "s") {
        ev.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [save]);

  // Enter moves to the next field
  const onKeyDown = (ev: React.KeyboardEvent<HTMLFormElement>) => {
    const t = ev.target as HTMLElement;
    if (ev.key !== "Enter" || t.tagName === "TEXTAREA" || t.tagName === "BUTTON" || t.hasAttribute("data-nav-skip-enter")) return;
    ev.preventDefault();
    const fields = Array.from(formRef.current!.querySelectorAll<HTMLElement>("input:not([disabled]):not([type=hidden]), select:not([disabled]), button[type=submit]"));
    const i = fields.indexOf(t);
    fields[i + 1]?.focus();
  };

  const sessionRow = (label: string, s: S, setRaw: (s: S) => void, r: ReturnType<typeof safe>) => {
    const set = (v: S) => {
      dirty.current = true;
      setRaw(v);
    };
    const mismatch = s.ratePerMaan && s.ratePerKg && (() => {
      try {
        return ratesMismatch(s.ratePerMaan, s.ratePerKg);
      } catch {
        return false;
      }
    })();
    return (
      <fieldset className="rounded-lg border border-slate-200 p-3" disabled={noSupply}>
        <legend className="px-1 text-sm font-semibold">{label}</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label>
            <span className="label">Maan</span>
            <input className="input text-right" inputMode="decimal" value={s.maan} disabled={qtyDisabled} onChange={(ev) => set({ ...s, maan: ev.target.value })} onFocus={(ev) => ev.target.select()} />
          </label>
          <label>
            <span className="label">KG</span>
            <input className="input text-right" inputMode="decimal" value={s.kg} disabled={qtyDisabled} onChange={(ev) => set({ ...s, kg: ev.target.value })} onFocus={(ev) => ev.target.select()} />
          </label>
          <label>
            <span className="label">Rate / Maan</span>
            <input
              className="input text-right"
              inputMode="decimal"
              value={s.ratePerMaan}
              disabled={rateDisabled}
              onFocus={(ev) => ev.target.select()}
              onChange={(ev) => {
                const v = ev.target.value;
                let k = s.ratePerKg;
                try {
                  k = v ? ratePerKgFromMaan(v).toString() : "";
                } catch {}
                set({ ...s, ratePerMaan: v, ratePerKg: k });
              }}
            />
          </label>
          <label>
            <span className="label">Rate / KG</span>
            <input
              className="input text-right"
              inputMode="decimal"
              value={s.ratePerKg}
              disabled={rateDisabled}
              onFocus={(ev) => ev.target.select()}
              onChange={(ev) => {
                const v = ev.target.value;
                let mm = s.ratePerMaan;
                try {
                  mm = v ? ratePerMaanFromKg(v).toString() : "";
                } catch {}
                set({ ...s, ratePerKg: v, ratePerMaan: mm });
              }}
            />
          </label>
        </div>
        <div className="mt-2 flex flex-wrap justify-between gap-2 text-sm">
          <span className="text-slate-500">
            {(() => {
              try {
                return `= ${toKg(s.maan || 0, s.kg || 0).toString()} KG`;
              } catch {
                return "";
              }
            })()}
            {mismatch && <span className="ml-2 text-amber-700">⚠ Rate/KG ≠ Rate/Maan ÷ 40</span>}
          </span>
          <span className="font-medium tabular-nums">{r.ok && r.amt ? `Amount: ${formatExact(r.amt)}` : <span className="text-red-600">Invalid number</span>}</span>
        </div>
      </fieldset>
    );
  };

  return (
    <form
      ref={formRef}
      onKeyDown={onKeyDown}
      onSubmit={(ev) => {
        ev.preventDefault();
        save();
      }}
      className="card space-y-4 p-4"
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="sm:col-span-2">
          <span className="label">Customer</span>
          <CustomerPicker ref={pickerRef} customers={p.customers} value={customerId} onChange={setCustomerId} disabled={!!edit} />
        </label>
        <label>
          <span className="label">Date</span>
          <input type="date" className="input" value={date} onChange={(ev) => setDate(ev.target.value)} disabled={!!edit} />
        </label>
        <label>
          <span className="label">Supply type</span>
          <select className="input" value={supplyType} onChange={(ev) => setSupplyType(ev.target.value as "BANDHI" | "MANDI")} disabled={!!edit || (customer && customer.customerType !== "BOTH")}>
            <option value="BANDHI">Bandhi</option>
            <option value="MANDI">Mandi</option>
          </select>
        </label>
      </div>

      {ctx?.existingId && !edit && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          This customer already has a {supplyType} entry for this date.{" "}
          <Link href={`/entries/${ctx.existingId}`} className="font-medium underline">
            Open it to edit
          </Link>
          .
        </div>
      )}
      {customerId && supplyType === "BANDHI" && ctx && !ctx.defaults.MORNING && !ctx.defaults.EVENING && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          No Bandhi rate is set for this customer on this date.{" "}
          <Link href={`/customers/${customerId}?tab=rates`} className="underline">
            Set rates
          </Link>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {sessionRow("Morning (صبح)", morning, setMorning, m)}
        {sessionRow("Evening (شام)", evening, setEvening, e)}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={noSupply} onChange={(ev) => setNoSupply(ev.target.checked)} /> No supply / holiday (records the day with zero quantity)
        </label>
        {ctx?.previous && !edit && (
          <button
            type="button"
            className="text-sm text-brand-800 underline"
            onClick={() => {
              if (ctx.previous!.morning) setMorning(ctx.previous!.morning);
              if (ctx.previous!.evening) setEvening(ctx.previous!.evening);
            }}
          >
            Copy previous day ({ctx.previous.date})
          </button>
        )}
      </div>

      <label className="block">
        <span className="label">Notes</span>
        <input className="input" value={notes} onChange={(ev) => setNotes(ev.target.value)} />
      </label>
      {edit && (
        <label className="block">
          <span className="label">Reason for change (required)</span>
          <input className="input" value={reason} onChange={(ev) => setReason(ev.target.value)} required />
        </label>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <div className="text-lg">
          Daily total: <span className="font-semibold tabular-nums text-brand-800">{total ? formatExact(total) : noSupply ? "0.00" : "—"}</span>
          {total && <span className="ml-2 text-sm text-slate-500">(displays {formatMoney(total, p.display, true)})</span>}
        </div>
        <div className="flex items-center gap-3">
          {msg && <span className={`text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</span>}
          <button type="submit" className="btn-primary" disabled={pending || (!!ctx?.existingId && !edit)}>
            {pending ? "Saving…" : edit ? "Save changes" : "Save (Ctrl+S)"}
          </button>
        </div>
      </div>
      {rateDisabled && <p className="text-xs text-slate-500">Bandhi rates come from the customer&apos;s rate card. Your role cannot override them.</p>}
    </form>
  );
}
