import { redirect } from "next/navigation";
import { requirePage } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/format";
import { ActionForm } from "@/components/ActionForm";
import { Card, Field, PageHeader } from "@/components/ui";
import { saveSettingsAction } from "@/app/actions/admin";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requirePage();
  if (!user.permissions.has(PERMISSIONS.SETTINGS_MANAGE)) {
    redirect(user.permissions.has(PERMISSIONS.PERIOD_CLOSE) ? "/settings/periods" : "/settings/audit");
  }
  const s = await getSettings();
  return (
    <>
      <PageHeader title="Business & display" />
      <Card>
        <ActionForm action={saveSettingsAction}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name">
              <input name="businessName" className="input" defaultValue={s.businessName} required />
            </Field>
            <Field label="Business name (Urdu)">
              <input name="businessNameUr" className="input font-urdu" dir="rtl" defaultValue={s.businessNameUr} />
            </Field>
            <Field label="Address">
              <input name="address" className="input" defaultValue={s.address} />
            </Field>
            <Field label="Phone">
              <input name="phone" className="input" defaultValue={s.phone} />
            </Field>
            <Field label="Statement footer" className="sm:col-span-2">
              <input name="statementFooter" className="input" defaultValue={s.statementFooter} />
            </Field>
            <Field label="Receipt prefix (letters)">
              <input name="receiptPrefix" className="input" defaultValue={s.receiptPrefix} pattern="[A-Z]{1,6}" />
            </Field>
            <Field label="Default language">
              <select name="defaultLanguage" className="input" defaultValue={s.defaultLanguage}>
                <option value="en">English</option>
                <option value="ur">Urdu</option>
              </select>
            </Field>
            <Field label="Amount display rounding (HALF_UP)">
              <select name="rounding" className="input" defaultValue={s.rounding}>
                <option value="RUPEE">Whole rupees (110,042.50 → 110,043)</option>
                <option value="PAISA">Paisa (110,042.50)</option>
              </select>
            </Field>
            <Field label="Number grouping">
              <select name="grouping" className="input" defaultValue={s.grouping}>
                <option value="INTL">International ({formatMoney(943577, { rounding: "RUPEE", grouping: "INTL" })})</option>
                <option value="LAKH">South Asian lakh ({formatMoney(943577, { rounding: "RUPEE", grouping: "LAKH" })})</option>
              </select>
            </Field>
          </div>
          <p className="mt-3 text-xs text-slate-500">Rounding only affects display. Stored amounts always keep 2 decimals; totals are computed from exact values.</p>
        </ActionForm>
      </Card>
    </>
  );
}
