import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { dec } from "@/lib/calc";
import { prisma } from "@/lib/db";
import { formatDate, isoDate, periodOf, periodRange, today } from "@/lib/dates";
import { formatExact, formatMoney } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { ActionForm } from "@/components/ActionForm";
import { LedgerTable } from "@/components/LedgerTable";
import { Badge, Card, Field, Money, PageHeader, Stat, Tabs } from "@/components/ui";
import { getCustomer } from "@/server/services/customers";
import { balance, getLedger } from "@/server/services/ledger";
import { listEntries } from "@/server/services/milkEntries";
import { listPayments } from "@/server/services/payments";
import { listStatements } from "@/server/services/statements";
import { setRateAction } from "@/app/actions/customers";
import { CustomerForm } from "../CustomerForm";

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const user = await requirePage();
  const [{ id }, { tab: tabParam }] = await Promise.all([params, searchParams]);
  const [c, s] = await Promise.all([getCustomer(id), getSettings()]);
  const can = (p: (typeof PERMISSIONS)[keyof typeof PERMISSIONS]) => user.permissions.has(p);
  const finance = can(PERMISSIONS.STATEMENTS_VIEW);

  const tabs = [
    { key: "info", label: "Info" },
    { key: "rates", label: "Rates" },
    { key: "milk", label: "Milk history" },
    ...(finance
      ? [
          { key: "ledger", label: "Ledger" },
          { key: "statements", label: "Statements" },
          { key: "payments", label: "Payments" },
        ]
      : []),
  ];
  const tab = tabs.some((t) => t.key === tabParam) ? tabParam! : "info";
  const bal = finance ? await balance(prisma, id) : null;
  const t = today();
  const { start: monthStart } = periodRange(periodOf(t));

  return (
    <>
      <PageHeader
        title={c.name}
        subtitle={
          <>
            {c.code} · <Badge>{c.customerType}</Badge> {c.status === "INACTIVE" && <Badge tone="red">Inactive</Badge>} {c.city && `· ${c.city}`} {c.mobile && `· ${c.mobile}`}
          </>
        }
        actions={
          <>
            {can(PERMISSIONS.MILK_ENTRY) && (
              <Link href={`/entries?customerId=${c.id}`} className="btn-secondary">
                Add milk entry
              </Link>
            )}
            {can(PERMISSIONS.PAYMENTS_MANAGE) && (
              <Link href={`/payments?customerId=${c.id}`} className="btn-secondary">
                Record payment
              </Link>
            )}
            {finance && (
              <Link href={`/statements?customerId=${c.id}&period=${periodOf(t)}`} className="btn-primary">
                Statement
              </Link>
            )}
          </>
        }
      />
      {bal && (
        <div className="mb-4 grid gap-4 sm:grid-cols-3">
          <Stat label={bal.gte(0) ? "Balance owed" : "Advance"} value={<Money value={bal.abs()} s={s} />} tone={bal.gt(0) ? "bad" : "good"} />
          <Stat label="Opening balance" value={<Money value={c.openingBalance} s={s} />} hint={c.openingBalanceDate ? `as of ${formatDate(c.openingBalanceDate)}` : undefined} />
        </div>
      )}
      <Tabs tabs={tabs} active={tab} base={`/customers/${c.id}`} />

      {tab === "info" && (
        <Card>
          {can(PERMISSIONS.CUSTOMERS_EDIT) ? (
            <CustomerForm customer={c} canEditOpening={can(PERMISSIONS.ADJUSTMENTS_MANAGE)} />
          ) : (
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              {[
                ["Business", c.businessName],
                ["Contact", c.contactPerson],
                ["Mobile", c.mobile],
                ["WhatsApp", c.whatsapp],
                ["Address", c.address],
                ["Notes", c.notes],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-slate-500">{k}</dt>
                  <dd>{v || "—"}</dd>
                </div>
              ))}
            </dl>
          )}
        </Card>
      )}

      {tab === "rates" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Rate history" className="overflow-x-auto lg:col-span-2">
            <table className="table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Session</th>
                  <th className="text-right">Default qty</th>
                  <th className="text-right">Rate/Maan</th>
                  <th className="text-right">Rate/KG</th>
                  <th>Effective</th>
                </tr>
              </thead>
              <tbody>
                {c.rates.map((r) => {
                  const current = r.effectiveFrom <= t && (!r.effectiveTo || r.effectiveTo >= t);
                  return (
                    <tr key={r.id} className={current ? "bg-green-50" : "text-slate-500"}>
                      <td>{r.supplyType}</td>
                      <td>{r.session}</td>
                      <td className="num">{r.supplyType === "BANDHI" ? `${dec(r.defaultMaan)} Maan ${dec(r.defaultKg)} KG` : "—"}</td>
                      <td className="num">{formatExact(r.ratePerMaan)}</td>
                      <td className="num">{dec(r.ratePerKg).toString()}</td>
                      <td className="whitespace-nowrap">
                        {formatDate(r.effectiveFrom)} → {r.effectiveTo ? formatDate(r.effectiveTo) : "now"} {current && <Badge tone="green">current</Badge>}
                      </td>
                    </tr>
                  );
                })}
                {c.rates.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-500">
                      No rates yet. Bandhi entries need a rate.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-500">Changing a rate adds a new row; past entries keep the rate they were saved with.</p>
          </Card>
          {can(PERMISSIONS.RATES_EDIT) && (
            <Card title="Set a new rate">
              <ActionForm action={setRateAction} submitLabel="Save rate">
                <input type="hidden" name="customerId" value={c.id} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Supply type">
                    <select name="supplyType" className="input" defaultValue={c.customerType === "MANDI" ? "MANDI" : "BANDHI"}>
                      <option value="BANDHI">Bandhi</option>
                      <option value="MANDI">Mandi</option>
                    </select>
                  </Field>
                  <Field label="Session">
                    <select name="session" className="input" defaultValue="BOTH">
                      <option value="BOTH">Morning + Evening</option>
                      <option value="MORNING">Morning</option>
                      <option value="EVENING">Evening</option>
                    </select>
                  </Field>
                  <Field label="Default Maan (Bandhi)">
                    <input name="defaultMaan" className="input text-right" inputMode="decimal" defaultValue="0" />
                  </Field>
                  <Field label="Default KG (Bandhi)">
                    <input name="defaultKg" className="input text-right" inputMode="decimal" defaultValue="0" />
                  </Field>
                  <Field label="Rate per Maan *">
                    <input name="ratePerMaan" className="input text-right" inputMode="decimal" required />
                  </Field>
                  <Field label="Rate per KG (blank = ÷40)">
                    <input name="ratePerKg" className="input text-right" inputMode="decimal" />
                  </Field>
                  <Field label="Effective from *" className="col-span-2">
                    <input name="effectiveFrom" type="date" className="input" defaultValue={isoDate(t)} required />
                  </Field>
                </div>
              </ActionForm>
            </Card>
          )}
        </div>
      )}

      {tab === "milk" && <MilkHistory customerId={c.id} from={monthStart} to={t} s={s} />}
      {tab === "ledger" && <LedgerTable ledger={await getLedger(prisma, c.id, new Date(Date.UTC(2000, 0, 1)), t, true)} s={s} customerId={c.id} />}
      {tab === "statements" && <StatementsTab customerId={c.id} s={s} />}
      {tab === "payments" && <PaymentsTab customerId={c.id} s={s} />}
    </>
  );
}

async function MilkHistory({ customerId, from, to, s }: { customerId: string; from: Date; to: Date; s: Awaited<ReturnType<typeof getSettings>> }) {
  const entries = await listEntries({ customerId, from: new Date(from.getTime() - 60 * 86400000), to });
  return (
    <Card title="Last ~3 months" className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th className="text-right">Morning</th>
            <th className="text-right">Evening</th>
            <th className="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {entries
            .slice()
            .reverse()
            .map((e) => {
              const m = e.sessions.find((x) => x.session === "MORNING");
              const ev = e.sessions.find((x) => x.session === "EVENING");
              return (
                <tr key={e.id}>
                  <td>
                    <Link href={`/entries/${e.id}`} className="hover:underline">
                      {formatDate(e.entryDate)}
                    </Link>
                  </td>
                  <td>{e.supplyType}</td>
                  <td className="num">{m ? `${dec(m.maan)}-${dec(m.kg)}` : "—"}</td>
                  <td className="num">{ev ? `${dec(ev.maan)}-${dec(ev.kg)}` : "—"}</td>
                  <td className="num">{formatMoney(e.totalAmount, s)}</td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </Card>
  );
}

async function StatementsTab({ customerId, s }: { customerId: string; s: Awaited<ReturnType<typeof getSettings>> }) {
  const list = await listStatements({ customerId });
  return (
    <Card className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>Period</th>
            <th>No.</th>
            <th>Version</th>
            <th>Status</th>
            <th>Paid</th>
            <th className="text-right">Closing</th>
          </tr>
        </thead>
        <tbody>
          {list.map((st) => (
            <tr key={st.id}>
              <td>{st.period}</td>
              <td>
                <Link href={`/statements/${st.id}`} className="text-brand-800 hover:underline">
                  {st.statementNo}
                </Link>
              </td>
              <td>v{st.version}</td>
              <td>{st.status === "FINAL" ? <Badge tone="green">FINAL</Badge> : <Badge>{st.status}</Badge>}</td>
              <td>{st.status === "FINAL" && <Badge tone={st.paidStatus === "PAID" ? "green" : st.paidStatus === "PARTIAL" ? "amber" : "red"}>{st.paidStatus}</Badge>}</td>
              <td className="num">
                <Money value={st.closingBalance} s={s} colored />
              </td>
            </tr>
          ))}
          {list.length === 0 && (
            <tr>
              <td colSpan={6} className="py-6 text-center text-slate-500">
                No statements yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}

async function PaymentsTab({ customerId, s }: { customerId: string; s: Awaited<ReturnType<typeof getSettings>> }) {
  const list = await listPayments({ customerId, includeVoided: true });
  return (
    <Card className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Receipt</th>
            <th>Method</th>
            <th>Allocated to</th>
            <th className="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {list.map((p) => (
            <tr key={p.id} className={p.voidedAt ? "text-slate-400 line-through" : ""}>
              <td>{formatDate(p.paymentDate)}</td>
              <td>
                <Link href={`/payments/${p.id}`} className="hover:underline">
                  {p.receiptNo}
                </Link>
              </td>
              <td>{p.method}</td>
              <td className="text-xs">{p.allocations.map((a) => `${a.statement?.period ?? "Opening"}: ${formatMoney(a.amount, s)}`).join(", ") || "Advance"}</td>
              <td className="num">{formatMoney(p.amount, s)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
