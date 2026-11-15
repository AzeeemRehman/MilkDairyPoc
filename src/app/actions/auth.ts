"use server";
import { redirect } from "next/navigation";
import { login, logout, verifyPassword } from "@/lib/auth";
import { currentActor } from "@/lib/actor";
import { toActionResult, type ActionResult } from "@/lib/errors";
import { str } from "@/lib/form";
import { changeOwnPassword } from "@/server/services/users";

export async function loginAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const r = await login(str(fd.get("username")), str(fd.get("password")));
  if (!r.ok) return { ok: false, message: r.message };
  redirect("/");
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}

export async function changePasswordAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await currentActor();
    await changeOwnPassword(actor, str(fd.get("current")), str(fd.get("next")), verifyPassword);
    await logout();
  } catch (e) {
    return toActionResult(e);
  }
  redirect("/login?changed=1");
}
