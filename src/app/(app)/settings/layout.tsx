import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { PERMISSIONS as P } from "@/lib/permissions";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePage();
  const links = [
    { href: "/settings", label: "Business & display", p: P.SETTINGS_MANAGE },
    { href: "/settings/users", label: "Users & roles", p: P.USERS_MANAGE },
    { href: "/settings/periods", label: "Periods (close / reopen)", p: P.PERIOD_CLOSE },
    { href: "/settings/audit", label: "Audit log", p: P.AUDIT_VIEW },
    { href: "/settings/backup", label: "Backup", p: P.BACKUP_MANAGE },
  ].filter((l) => user.permissions.has(l.p));
  return (
    <div className="grid gap-6 lg:grid-cols-[13rem_1fr]">
      <nav className="no-print flex gap-1 overflow-x-auto lg:flex-col">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="rounded-md px-3 py-2 text-sm whitespace-nowrap text-slate-700 hover:bg-slate-100">
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
