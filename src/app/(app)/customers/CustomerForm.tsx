import type { Customer } from "@prisma/client";
import { dec } from "@/lib/calc";
import { isoDate } from "@/lib/dates";
import { ActionForm } from "@/components/ActionForm";
import { Field } from "@/components/ui";
import { saveCustomerAction } from "@/app/actions/customers";

export function CustomerForm({ customer, canEditOpening }: { customer?: Customer; canEditOpening: boolean }) {
  const c = customer;
  return (
    <ActionForm action={saveCustomerAction} redirectTo={c ? undefined : "/customers/{id}"} submitLabel={c ? "Save changes" : "Create customer"}>
      {c && <input type="hidden" name="id" value={c.id} />}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Name *">
          <input name="name" className="input" defaultValue={c?.name} required autoFocus={!c} />
        </Field>
        <Field label="Name (Urdu)">
          <input name="nameUr" className="input font-urdu" dir="rtl" defaultValue={c?.nameUr ?? ""} />
        </Field>
        <Field label="Customer code (auto if blank)">
          <input name="code" className="input" defaultValue={c?.code} />
        </Field>
        <Field label="Business name">
          <input name="businessName" className="input" defaultValue={c?.businessName ?? ""} />
        </Field>
        <Field label="Contact person">
          <input name="contactPerson" className="input" defaultValue={c?.contactPerson ?? ""} />
        </Field>
        <Field label="Customer type *">
          <select name="customerType" className="input" defaultValue={c?.customerType ?? "BANDHI"}>
            <option value="BANDHI">Bandhi (fixed daily)</option>
            <option value="MANDI">Mandi (variable)</option>
            <option value="BOTH">Both</option>
          </select>
        </Field>
        <Field label="Mobile">
          <input name="mobile" className="input" inputMode="tel" defaultValue={c?.mobile ?? ""} />
        </Field>
        <Field label="WhatsApp">
          <input name="whatsapp" className="input" inputMode="tel" defaultValue={c?.whatsapp ?? ""} />
        </Field>
        <Field label="City">
          <input name="city" className="input" defaultValue={c?.city ?? ""} />
        </Field>
        <Field label="Address" className="sm:col-span-2 lg:col-span-3">
          <input name="address" className="input" defaultValue={c?.address ?? ""} />
        </Field>
        <Field label="Opening balance (+ owed by customer, − advance)">
          <input name="openingBalance" className="input text-right" inputMode="decimal" defaultValue={c ? dec(c.openingBalance).toString() : "0"} disabled={!!c && !canEditOpening} />
        </Field>
        <Field label="Opening balance date">
          <input name="openingBalanceDate" type="date" className="input" defaultValue={c?.openingBalanceDate ? isoDate(c.openingBalanceDate) : ""} disabled={!!c && !canEditOpening} />
        </Field>
        <Field label="Status">
          <select name="status" className="input" defaultValue={c?.status ?? "ACTIVE"}>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </Field>
        <Field label="Notes" className="sm:col-span-2 lg:col-span-3">
          <textarea name="notes" className="input" rows={2} defaultValue={c?.notes ?? ""} />
        </Field>
        {c && canEditOpening && (
          <Field label="Reason (required if the opening balance changes)" className="sm:col-span-2 lg:col-span-3">
            <input name="reason" className="input" />
          </Field>
        )}
      </div>
      {c && !canEditOpening && (
        <>
          <input type="hidden" name="openingBalance" value={dec(c.openingBalance).toString()} />
          <input type="hidden" name="openingBalanceDate" value={c.openingBalanceDate ? isoDate(c.openingBalanceDate) : ""} />
        </>
      )}
    </ActionForm>
  );
}
