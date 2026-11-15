"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export interface NavItem {
  href: string;
  label: string;
}

export function Sidebar({ items, businessName, user, logout }: { items: NavItem[]; businessName: string; user: { name: string; role: string }; logout: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const isActive = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

  const nav = (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          onClick={() => setOpen(false)}
          className={`rounded-md px-3 py-2 text-sm ${isActive(i.href) ? "bg-brand-700 font-medium text-white" : "text-slate-200 hover:bg-white/10"}`}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
  const footer = (
    <div className="border-t border-white/10 p-3 text-xs text-slate-300">
      <div className="font-medium text-white">{user.name}</div>
      <div>{user.role}</div>
      <div className="mt-2 flex gap-3">
        <Link href="/account" className="hover:underline" onClick={() => setOpen(false)}>
          Account
        </Link>
        <form action={logout}>
          <button className="hover:underline">Sign out</button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="no-print sticky top-0 z-30 flex items-center justify-between bg-brand-900 px-4 py-3 text-white md:hidden">
        <button aria-label="Open menu" onClick={() => setOpen(true)} className="text-2xl leading-none">
          ☰
        </button>
        <span className="font-semibold">{businessName}</span>
        <span className="w-6" />
      </div>
      {/* Mobile drawer */}
      {open && (
        <div className="no-print fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-brand-900">
            <div className="px-4 py-4 font-semibold text-white">{businessName}</div>
            {nav}
            {footer}
          </aside>
        </div>
      )}
      {/* Desktop sidebar */}
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-brand-900 md:flex">
        <div className="px-4 py-4">
          <div className="text-xs tracking-wider text-brand-100/70 uppercase">Dairy Manager</div>
          <div className="font-semibold text-white">{businessName}</div>
        </div>
        {nav}
        {footer}
      </aside>
    </>
  );
}
