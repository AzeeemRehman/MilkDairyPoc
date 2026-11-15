"use client";
import { forwardRef, useEffect, useMemo, useState } from "react";

export interface PickerCustomer {
  id: string;
  name: string;
  code: string;
  customerType?: string;
}

/** Keyboard-friendly type-ahead (↑/↓ to move, Enter to pick). */
export const CustomerPicker = forwardRef<HTMLInputElement, { customers: PickerCustomer[]; value: string; onChange: (id: string) => void; onPicked?: () => void; disabled?: boolean }>(
  function CustomerPicker({ customers, value, onChange, onPicked, disabled }, ref) {
    const selected = customers.find((c) => c.id === value);
    const [text, setText] = useState(selected ? `${selected.name} (${selected.code})` : "");
    const [open, setOpen] = useState(false);
    const [hi, setHi] = useState(0);

    useEffect(() => {
      setText(selected ? `${selected.name} (${selected.code})` : "");
    }, [selected]);

    const matches = useMemo(() => {
      const q = text.toLowerCase().trim();
      if (!q || (selected && text === `${selected.name} (${selected.code})`)) return customers.slice(0, 12);
      return customers.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)).slice(0, 12);
    }, [text, customers, selected]);

    const pick = (c: PickerCustomer) => {
      onChange(c.id);
      setText(`${c.name} (${c.code})`);
      setOpen(false);
      onPicked?.();
    };

    return (
      <div className="relative">
        <input
          ref={ref}
          className="input"
          value={text}
          disabled={disabled}
          placeholder="Type a name or code…"
          role="combobox"
          aria-expanded={open}
          data-nav-skip-enter
          onFocus={(e) => {
            e.target.select();
            setOpen(true);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setHi(0);
            if (value) onChange("");
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setHi((h) => Math.min(h + 1, matches.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHi((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter" && open && matches[hi]) {
              e.preventDefault();
              pick(matches[hi]);
            } else if (e.key === "Escape") setOpen(false);
          }}
        />
        {open && matches.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg" role="listbox">
            {matches.map((c, i) => (
              <li
                key={c.id}
                role="option"
                aria-selected={i === hi}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(c);
                }}
                className={`flex cursor-pointer justify-between px-3 py-2 text-sm ${i === hi ? "bg-brand-50" : ""}`}
              >
                <span>{c.name}</span>
                <span className="text-xs text-slate-500">
                  {c.code} {c.customerType && `· ${c.customerType}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  },
);
