import { requirePage } from "@/lib/auth";
import { ActionForm } from "@/components/ActionForm";
import { Card, Field, PageHeader } from "@/components/ui";
import { changePasswordAction } from "@/app/actions/auth";

export default async function AccountPage() {
  const user = await requirePage();
  return (
    <>
      <PageHeader title="My account" subtitle={`${user.name} · ${user.roleName}`} />
      <Card title="Change password" className="max-w-md">
        <ActionForm action={changePasswordAction} submitLabel="Change password">
          <div className="space-y-3">
            <Field label="Current password">
              <input name="current" type="password" className="input" autoComplete="current-password" required />
            </Field>
            <Field label="New password (min. 8 characters)">
              <input name="next" type="password" className="input" autoComplete="new-password" minLength={8} required />
            </Field>
            <p className="text-xs text-slate-500">All your sessions will be signed out after the change.</p>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
