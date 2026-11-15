import { requirePage } from "@/lib/auth";
import { formatDate, isoDate, parseDate, periodOf, periodRange, today, todayIso } from "@/lib/dates";
import { formatExact, formatMoney } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { ActionForm } from "@/components/ActionForm";
import { ReasonButton } from "@/components/ReasonButton";
import { Card, Field, PageHeader } from "@/components/ui";
import { listCategories, listExpenses } from "@/server/services/expenses";
import { createExpenseAction, voidExpenseAction } from "@/app/actions/finance";

export const metadata = { title: "Expenses" };
const ok = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; categoryId?: string }> }) {
  await requirePage(PERMISSIONS.EXPENSES_MANAGE);
  const sp = await searchParams;
  const from = ok(sp.from) ? sp.from! : isoDate(periodRange(periodOf(today())).start);
  const to = ok(sp.to) ? sp.to! : todayIso();
  const [cats, list, s] = await Promise.all([listCategories(), listExpenses({ from: parseDate(from), to: parseDate(to), categoryId: sp.categoryId || undefined }), getSettings()]);
  const total = list.reduce((a, e) => a + Number(e.amount), 0);

  return (
    <>
      <PageHeader title="Expenses" />
      <Card title="Add expense" className="mb-6">
        <ActionForm action={createExpenseAction} resetOnSuccess submitLabel="Save expense">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Field label="Date *">
              <input type="date" name="expenseDate" className="input" defaultValue={todayIso()} required />
            </Field>
            <Field label="Category *">
              <select name="categoryId" className="input" required>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nameEn} / {c.nameUr}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Description *" className="sm:col-span-2">
              <input name="description" className="input" required />
            </Field>
            <Field label="Amount *">
              <input name="amount" className="input text-right" inputMode="decimal" required />
            </Field>
            <Field label="Method">
              <select name="method" className="input">
                {["CASH", "BANK", "JAZZCASH", "EASYPAISA", "OTHER"].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </Field>
            <Field label="Notes" className="sm:col-span-2 lg:col-span-3">
              <input name="notes" className="input" />
            </Field>
            <Field label="Receipt (JPG/PNG/PDF, max 5 MB)" className="lg:col-span-3">
              <input type="file" name="attachment" accept="image/jpeg,image/png,application/pdf" className="input" />
            </Field>
          </div>
        </ActionForm>
      </Card>
      <form method="get" className="card mb-4 grid gap-3 p-4 sm:grid-cols-4">
        <input type="date" name="from" defaultValue={from} className="input" />
        <input type="date" name="to" defaultValue={to} className="input" />
        <select name="categoryId" defaultValue={sp.categoryId ?? ""} className="input">
          <option value="">All categories</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nameEn}
            </option>
          ))}
        </select>
        <button className="btn-secondary">Filter</button>
      </form>
      <Card title={`Expenses · ${formatMoney(total, s, true)}`} className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Category</th>
              <th>Description</th>
              <th>Method</th>
              <th>Receipt</th>
              <th className="text-right">Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((e) => (
              <tr key={e.id}>
                <td>{formatDate(e.expenseDate)}</td>
                <td>{e.category.nameEn}</td>
                <td>{e.description}</td>
                <td>{e.method}</td>
                <td>
                  {e.attachmentPath && (
                    <a href={`/api/v1/expenses/${e.id}/attachment`} target="_blank" className="text-brand-800 underline">
                      View
                    </a>
                  )}
                </td>
                <td className="num">{formatExact(e.amount)}</td>
                <td className="text-right">
                  <ReasonButton label="Void" title="Void this expense?" run={voidExpenseAction.bind(null, e.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
