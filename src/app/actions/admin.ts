"use server";
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/actor";
import { audit } from "@/lib/audit";
import { forbidden, toActionResult, type ActionResult } from "@/lib/errors";
import { formObject, str } from "@/lib/form";
import { PERMISSIONS } from "@/lib/permissions";
import { getSettings, saveSettings, type BusinessSettings } from "@/lib/settings";
import { createUser, updateUser, type UserInput } from "@/server/services/users";

export async function saveUserAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await currentActor();
    const input = formObject(fd, ["isActive"]) as unknown as UserInput;
    const id = str(fd.get("id"));
    if (id) await updateUser(actor, id, input);
    else await createUser(actor, input);
    revalidatePath("/settings/users");
    return { ok: true, message: id ? "User updated." : "User created." };
  } catch (e) {
    return toActionResult(e);
  }
}

const SETTING_KEYS: (keyof BusinessSettings)[] = [
  "businessName",
  "businessNameUr",
  "address",
  "phone",
  "statementFooter",
  "receiptPrefix",
  "rounding",
  "grouping",
  "defaultLanguage",
];

export async function saveSettingsAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await currentActor();
    if (!actor.permissions.has(PERMISSIONS.SETTINGS_MANAGE)) throw forbidden();
    const old = await getSettings();
    const values: Partial<BusinessSettings> = {};
    for (const k of SETTING_KEYS) {
      const v = fd.get(k);
      if (typeof v === "string") (values as Record<string, string>)[k] = v.trim();
    }
    if (values.rounding && !["RUPEE", "PAISA"].includes(values.rounding)) values.rounding = "RUPEE";
    if (values.grouping && !["INTL", "LAKH"].includes(values.grouping)) values.grouping = "INTL";
    if (values.receiptPrefix && !/^[A-Z]{1,6}$/.test(values.receiptPrefix)) values.receiptPrefix = "RC";
    await saveSettings(values);
    await audit(actor.id, "UPDATE", "Settings", null, { oldValues: old, newValues: values, ip: actor.ip });
    revalidatePath("/", "layout");
    return { ok: true, message: "Settings saved." };
  } catch (e) {
    return toActionResult(e);
  }
}
