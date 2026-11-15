import Link from "next/link";
import { balanceClass, formatMoney, type DisplaySettings } from "@/lib/format";
import type { NumLike } from "@/lib/calc";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="no-print mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, children, className = "", actions }: { title?: React.ReactNode; children: React.ReactNode; className?: string; actions?: React.ReactNode }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Stat({ label, value, tone = "default", hint }: { label: string; value: React.ReactNode; tone?: "default" | "good" | "bad"; hint?: string }) {
  const color = tone === "good" ? "text-green-700" : tone === "bad" ? "text-red-700" : "text-slate-900";
  return (
    <div className="card p-4">
      <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

/** Amount for display (HALF_UP to whole rupees / paisa per settings). */
export function Money({ value, s, colored = false, prefix = false }: { value: NumLike; s?: DisplaySettings; colored?: boolean; prefix?: boolean }) {
  return <span className={colored ? balanceClass(value) : undefined}>{formatMoney(value, s, prefix)}</span>;
}

export function Badge({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "green" | "red" | "amber" | "blue" }) {
  const map = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-green-100 text-green-800",
    red: "bg-red-100 text-red-800",
    amber: "bg-amber-100 text-amber-800",
    blue: "bg-blue-100 text-blue-800",
  };
  return <span className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${map[tone]}`}>{children}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-8 text-center text-sm text-slate-500">{children}</div>;
}

export function Tabs({ tabs, active, base }: { tabs: { key: string; label: string }[]; active: string; base: string }) {
  return (
    <nav className="no-print mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={`${base}${base.includes("?") ? "&" : "?"}tab=${t.key}`}
          className={`border-b-2 px-3 py-2 text-sm whitespace-nowrap ${t.key === active ? "border-brand-700 font-medium text-brand-800" : "border-transparent text-slate-600 hover:text-slate-900"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function CustomerOptions({ customers }: { customers: { id: string; name: string; code: string }[] }) {
  return (
    <>
      {customers.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name} ({c.code})
        </option>
      ))}
    </>
  );
}
