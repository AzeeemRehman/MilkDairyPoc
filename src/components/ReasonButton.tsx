"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/errors";

/**
 * Confirmation dialog with a required reason field, used for void / reopen / close.
 * `run(reason)` is a bound server action.
 */
export function ReasonButton({
  label,
  title,
  description,
  run,
  danger = true,
  requireReason = true,
  className,
}: {
  label: string;
  title: string;
  description?: string;
  run: (reason: string) => Promise<ActionResult>;
  danger?: boolean;
  requireReason?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <>
      <button type="button" className={className ?? (danger ? "text-sm text-red-700 hover:underline" : "btn-secondary")} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="card w-full max-w-md p-5">
            <h3 className="text-base font-semibold">{title}</h3>
            {description && <p className="mt-1 text-sm whitespace-pre-line text-slate-600">{description}</p>}
            {requireReason && (
              <label className="mt-4 block">
                <span className="label">Reason (required)</span>
                <textarea className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
              </label>
            )}
            {msg && !msg.ok && <p className="mt-2 text-sm whitespace-pre-line text-red-700">{msg.message}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </button>
              <button
                type="button"
                className={danger ? "btn-danger" : "btn-primary"}
                disabled={pending || (requireReason && !reason.trim())}
                onClick={() =>
                  start(async () => {
                    const r = await run(reason);
                    setMsg(r);
                    if (r.ok) {
                      setOpen(false);
                      setReason("");
                      router.refresh();
                      if (r.message) alert(r.message);
                    }
                  })
                }
              >
                {pending ? "Working…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
