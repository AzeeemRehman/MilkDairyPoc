"use client";
import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/errors";

type Action = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

/**
 * Form bound to a server action. Shows the result message and field errors, optionally resets
 * on success, or navigates to `redirectTo(data)`.
 */
export function ActionForm({
  action,
  children,
  className = "",
  resetOnSuccess = false,
  redirectTo,
  submitLabel = "Save",
  confirm,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  /** Path to open on success; "{id}" is replaced with data.id. */
  redirectTo?: string;
  submitLabel?: string;
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!state?.ok) return;
    if (resetOnSuccess) ref.current?.reset();
    if (redirectTo) router.push(redirectTo.replace("{id}", String((state.data as { id?: string } | undefined)?.id ?? "")));
    else router.refresh();
  }, [state, resetOnSuccess, redirectTo, router]);

  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      {state?.fieldErrors && (
        <ul className="mt-3 list-inside list-disc text-sm text-red-700">
          {Object.entries(state.fieldErrors).map(([k, v]) => (
            <li key={k}>
              <span className="font-medium">{k}</span>: {v}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </button>
        {state?.message && (
          <span role="status" className={`text-sm whitespace-pre-line ${state.ok ? "text-green-700" : "text-red-700"}`}>
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}
