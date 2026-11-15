/** Consistent error shape: {code, message, fieldErrors} (PLANNING.md §8). */
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

export const forbidden = (msg = "You do not have permission to do this.") => new AppError("FORBIDDEN", msg);
export const notFound = (what = "Record") => new AppError("NOT_FOUND", `${what} not found.`);
export const conflict = (msg: string) => new AppError("CONFLICT", msg);
export const invalid = (msg: string, fieldErrors?: Record<string, string>) => new AppError("VALIDATION", msg, fieldErrors);
export const periodClosed = (period: string) =>
  new AppError("PERIOD_CLOSED", `Period ${period} is closed. Ask an admin to reopen it before making changes.`);

export interface ActionResult<T = unknown> {
  ok: boolean;
  code?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
  data?: T;
}

export function toActionResult(e: unknown): ActionResult {
  if (e instanceof AppError) return { ok: false, code: e.code, message: e.message, fieldErrors: e.fieldErrors };
  // Zod
  if (e && typeof e === "object" && "issues" in e && Array.isArray((e as { issues: unknown[] }).issues)) {
    const fieldErrors: Record<string, string> = {};
    for (const i of (e as { issues: { path: (string | number)[]; message: string }[] }).issues) {
      fieldErrors[i.path.join(".") || "form"] = i.message;
    }
    return { ok: false, code: "VALIDATION", message: "Please correct the highlighted fields.", fieldErrors };
  }
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("PERIOD_CLOSED")) return { ok: false, code: "PERIOD_CLOSED", message: "That date is in a closed period." };
  if (msg.includes("Unique constraint")) return { ok: false, code: "CONFLICT", message: "A record with these details already exists." };
  console.error(e);
  return { ok: false, code: "INTERNAL", message: "Something went wrong. Please try again." };
}
