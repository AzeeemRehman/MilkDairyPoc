import { requirePage } from "@/lib/auth";
import { PERMISSIONS as P, type Permission } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { Sidebar, type NavItem } from "@/components/Sidebar";
import { logoutAction } from "@/app/actions/auth";

const NAV: (NavItem & { any: Permission[] })[] = [
  { href: "/", label: "Dashboard", any: [P.DASHBOARD_VIEW, P.MILK_VIEW] },
  { href: "/entries", label: "Daily Milk Entry", any: [P.MILK_ENTRY] },
  { href: "/entries/bulk", label: "Bulk Bandhi Entry", any: [P.MILK_ENTRY] },
  { href: "/records", label: "Bandhi / Mandi Records", any: [P.MILK_VIEW] },
  { href: "/customers", label: "Customers", any: [P.CUSTOMERS_EDIT, P.STATEMENTS_VIEW] },
  { href: "/ledger", label: "Customer Ledger", any: [P.STATEMENTS_VIEW] },
  { href: "/payments", label: "Payments", any: [P.PAYMENTS_MANAGE] },
  { href: "/adjustments", label: "Adjustments", any: [P.ADJUSTMENTS_MANAGE] },
  { href: "/statements", label: "Monthly Statements", any: [P.STATEMENTS_VIEW] },
  { href: "/expenses", label: "Expenses", any: [P.EXPENSES_MANAGE] },
  { href: "/reports", label: "Reports", any: [P.REPORTS_VIEW] },
  { href: "/settings", label: "Settings", any: [P.SETTINGS_MANAGE, P.USERS_MANAGE, P.PERIOD_CLOSE, P.AUDIT_VIEW] },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePage();
  const settings = await getSettings();
  const items = NAV.filter((n) => n.any.some((p) => user.permissions.has(p))).map(({ href, label }) => ({ href, label }));
  return (
    <div className="md:flex">
      <Sidebar items={items} businessName={settings.businessName} user={{ name: user.name, role: user.roleName }} logout={logoutAction} />
      <main className="print-full mx-auto w-full max-w-7xl min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
