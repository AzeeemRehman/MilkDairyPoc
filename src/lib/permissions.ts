/** Permission codes and the default role matrix (PLANNING.md §7). Enforced server-side. */
export const PERMISSIONS = {
  DASHBOARD_VIEW: "dashboard.view", // financial dashboard
  REPORTS_VIEW: "reports.view",
  MILK_VIEW: "milk.view",
  CUSTOMERS_EDIT: "customers.edit",
  RATES_EDIT: "rates.edit",
  MILK_ENTRY: "milk.entry",
  MILK_OVERRIDE_QTY: "milk.override_qty",
  MILK_OVERRIDE_RATE: "milk.override_rate",
  MILK_EDIT_PAST: "milk.edit_past", // without it: same-day edits only
  PAYMENTS_MANAGE: "payments.manage",
  ADJUSTMENTS_MANAGE: "adjustments.manage",
  EXPENSES_MANAGE: "expenses.manage",
  STATEMENTS_VIEW: "statements.view",
  STATEMENTS_GENERATE: "statements.generate",
  PERIOD_CLOSE: "period.close",
  PERIOD_REOPEN: "period.reopen",
  USERS_MANAGE: "users.manage",
  SETTINGS_MANAGE: "settings.manage",
  BACKUP_MANAGE: "backup.manage",
  AUDIT_VIEW: "audit.view",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
export type RoleCode = "ADMIN" | "ACCOUNTANT" | "DATA_ENTRY" | "VIEWER";

const P = PERMISSIONS;
const ALL = Object.values(P) as Permission[];

export const ROLE_MATRIX: Record<RoleCode, { name: string; permissions: Permission[] }> = {
  ADMIN: { name: "Admin", permissions: ALL },
  ACCOUNTANT: {
    name: "Accountant",
    permissions: ALL.filter((p) => !([P.PERIOD_REOPEN, P.USERS_MANAGE, P.SETTINGS_MANAGE, P.BACKUP_MANAGE] as Permission[]).includes(p)),
  },
  // D3 default: Data Entry may override Bandhi quantities, not rates.
  DATA_ENTRY: {
    name: "Data Entry Operator",
    permissions: [P.MILK_VIEW, P.CUSTOMERS_EDIT, P.MILK_ENTRY, P.MILK_OVERRIDE_QTY],
  },
  VIEWER: {
    name: "Viewer",
    permissions: [P.DASHBOARD_VIEW, P.REPORTS_VIEW, P.MILK_VIEW, P.STATEMENTS_VIEW],
  },
};

export function can(perms: readonly string[] | Set<string>, p: Permission): boolean {
  return perms instanceof Set ? perms.has(p) : perms.includes(p);
}
