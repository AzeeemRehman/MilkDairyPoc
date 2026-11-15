import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { Badge, Money, PageHeader } from "@/components/ui";
import { cities, listCustomers } from "@/server/services/customers";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePage();
  const sp = await searchParams;
  const [customers, cityList, s] = await Promise.all([
    listCustomers({ q: sp.q, city: sp.city, type: sp.type, status: sp.status ?? "ACTIVE" }),
    cities(),
    getSettings(),
  ]);
  const showBalance = user.permissions.has(PERMISSIONS.STATEMENTS_VIEW);
  const canEdit = user.permissions.has(PERMISSIONS.CUSTOMERS_EDIT);

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle={`${customers.length} customer(s)`}
        actions={
          canEdit && (
            <Link href="/customers/new" className="btn-primary">
              + New customer
            </Link>
          )
        }
      />
      <form className="card mb-4 grid gap-3 p-4 sm:grid-cols-5" method="get">
        <input name="q" placeholder="Search name, code, mobile…" defaultValue={sp.q} className="input sm:col-span-2" />
        <select name="city" defaultValue={sp.city ?? ""} className="input">
          <option value="">All cities</option>
          {cityList.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select name="type" defaultValue={sp.type ?? ""} className="input">
          <option value="">All types</option>
          <option value="BANDHI">Bandhi</option>
          <option value="MANDI">Mandi</option>
          <option value="BOTH">Both</option>
        </select>
        <div className="flex gap-2">
          <select name="status" defaultValue={sp.status ?? "ACTIVE"} className="input">
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="">All</option>
          </select>
          <button className="btn-secondary">Filter</button>
        </div>
      </form>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>City</th>
              <th>Type</th>
              <th>Mobile</th>
              <th>Status</th>
              {showBalance && <th className="text-right">Balance</th>}
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="text-slate-500">{c.code}</td>
                <td>
                  <Link href={`/customers/${c.id}`} className="font-medium text-brand-800 hover:underline">
                    {c.name}
                  </Link>
                  {c.businessName && <div className="text-xs text-slate-500">{c.businessName}</div>}
                </td>
                <td>{c.city}</td>
                <td>
                  <Badge tone={c.customerType === "MANDI" ? "blue" : c.customerType === "BOTH" ? "amber" : "green"}>{c.customerType}</Badge>
                </td>
                <td>{c.mobile}</td>
                <td>{c.status === "ACTIVE" ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</td>
                {showBalance && (
                  <td className="num font-medium">
                    <Money value={c.balance} s={s} colored />
                  </td>
                )}
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">
                  No customers found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
