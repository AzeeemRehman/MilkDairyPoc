"use client";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const fmt = (v: number) => Math.round(v).toLocaleString("en-US");
const short = (v: number) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `${Math.round(v / 1e3)}k` : String(v));
const month = (p: string) => new Date(`${p}-01T00:00:00Z`).toLocaleString("en-GB", { month: "short", timeZone: "UTC" });

export function DashboardCharts({
  series,
  top,
}: {
  series: { period: string; bandhi: number; mandi: number; payments: number; expenses: number; profit: number }[];
  top: { id: string; name: string; balance: number }[];
}) {
  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      <div className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">Monthly milk sales — Bandhi vs Mandi</h2>
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="period" tickFormatter={month} fontSize={12} />
              <YAxis tickFormatter={short} fontSize={12} width={48} />
              <Tooltip formatter={(v: number) => fmt(v)} labelFormatter={month} />
              <Legend />
              <Bar dataKey="bandhi" name="Bandhi" stackId="s" fill="#15803d" />
              <Bar dataKey="mandi" name="Mandi" stackId="s" fill="#86efac" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">Payments vs expenses</h2>
        <div className="h-64">
          <ResponsiveContainer>
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="period" tickFormatter={month} fontSize={12} />
              <YAxis tickFormatter={short} fontSize={12} width={48} />
              <Tooltip formatter={(v: number) => fmt(v)} labelFormatter={month} />
              <Legend />
              <Line dataKey="payments" name="Payments received" stroke="#15803d" strokeWidth={2} dot={false} />
              <Line dataKey="expenses" name="Expenses" stroke="#dc2626" strokeWidth={2} dot={false} />
              <Line dataKey="profit" name="Profit" stroke="#2563eb" strokeWidth={2} dot={false} strokeDasharray="4 3" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="card p-4 lg:col-span-2">
        <h2 className="mb-3 text-sm font-semibold">Top outstanding balances</h2>
        {top.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">No outstanding balances.</p>
        ) : (
          <div style={{ height: Math.max(120, top.length * 34) }}>
            <ResponsiveContainer>
              <BarChart data={top} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tickFormatter={short} fontSize={12} />
                <YAxis type="category" dataKey="name" width={140} fontSize={12} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Bar dataKey="balance" name="Outstanding" fill="#dc2626" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
