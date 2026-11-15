import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ changed?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const [{ changed }, settings] = await Promise.all([searchParams, getSettings()]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 to-slate-900 p-4">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-5 text-center">
          <div className="text-xs tracking-wider text-slate-500 uppercase">Dairy Manager</div>
          <h1 className="text-lg font-semibold">{settings.businessName}</h1>
        </div>
        {changed && <p className="mb-3 rounded bg-green-50 p-2 text-sm text-green-800">Password changed. Please sign in again.</p>}
        <LoginForm />
      </div>
    </div>
  );
}
