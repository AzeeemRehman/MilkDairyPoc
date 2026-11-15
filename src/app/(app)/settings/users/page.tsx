import { requirePage } from "@/lib/auth";
import { PERMISSIONS, ROLE_MATRIX } from "@/lib/permissions";
import { ActionForm } from "@/components/ActionForm";
import { Badge, Card, Field, PageHeader } from "@/components/ui";
import { listUsers } from "@/server/services/users";
import { saveUserAction } from "@/app/actions/admin";

export const metadata = { title: "Users" };

function UserFields({ u }: { u?: Awaited<ReturnType<typeof listUsers>>[number] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {u && <input type="hidden" name="id" value={u.id} />}
      <Field label="Name">
        <input name="name" className="input" defaultValue={u?.name} required />
      </Field>
      <Field label="Username">
        <input name="username" className="input" defaultValue={u?.username} required autoComplete="off" />
      </Field>
      <Field label="Role">
        <select name="roleCode" className="input" defaultValue={u?.role.code ?? "DATA_ENTRY"}>
          {Object.entries(ROLE_MATRIX).map(([k, v]) => (
            <option key={k} value={k}>
              {v.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={u ? "New password (blank = keep)" : "Password (min. 8)"}>
        <input name="password" type="password" className="input" autoComplete="new-password" required={!u} />
      </Field>
      <div className="flex items-end gap-4 pb-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isActive" defaultChecked={u?.isActive ?? true} /> Active
        </label>
        <select name="locale" className="input w-auto py-1" defaultValue={u?.locale ?? "en"}>
          <option value="en">EN</option>
          <option value="ur">UR</option>
        </select>
      </div>
    </div>
  );
}

export default async function UsersPage() {
  await requirePage(PERMISSIONS.USERS_MANAGE);
  const users = await listUsers();
  return (
    <>
      <PageHeader title="Users & roles" subtitle="Changing a password, role or deactivating a user signs them out everywhere." />
      <Card title="Add user" className="mb-6">
        <ActionForm action={saveUserAction} resetOnSuccess submitLabel="Create user">
          <UserFields />
        </ActionForm>
      </Card>
      <div className="space-y-3">
        {users.map((u) => (
          <details key={u.id} className="card p-4">
            <summary className="flex cursor-pointer flex-wrap items-center gap-2">
              <span className="font-medium">{u.name}</span>
              <span className="text-sm text-slate-500">@{u.username}</span>
              <Badge tone="blue">{u.role.name}</Badge>
              {!u.isActive && <Badge tone="red">Inactive</Badge>}
              <span className="ml-auto text-xs text-slate-500">Last login: {u.lastLoginAt ? u.lastLoginAt.toLocaleString("en-GB", { timeZone: "Asia/Karachi" }) : "never"}</span>
            </summary>
            <div className="mt-4">
              <ActionForm action={saveUserAction} submitLabel="Save user">
                <UserFields u={u} />
              </ActionForm>
            </div>
          </details>
        ))}
      </div>
      <Card title="Role permissions" className="mt-6 overflow-x-auto">
        <table className="table text-xs">
          <thead>
            <tr>
              <th>Permission</th>
              {Object.values(ROLE_MATRIX).map((r) => (
                <th key={r.name} className="text-center">
                  {r.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.values(PERMISSIONS).map((p) => (
              <tr key={p}>
                <td className="font-mono">{p}</td>
                {Object.values(ROLE_MATRIX).map((r) => (
                  <td key={r.name} className="text-center">
                    {r.permissions.includes(p) ? "✓" : ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
