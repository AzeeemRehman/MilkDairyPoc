"use server";
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/actor";
import { toActionResult, type ActionResult } from "@/lib/errors";
import { formObject, str } from "@/lib/form";
import { createCustomer, setRate, updateCustomer, type CustomerInput, type RateInput } from "@/server/services/customers";

export async function saveCustomerAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await currentActor();
    const input = formObject(fd) as unknown as CustomerInput;
    const id = str(fd.get("id"));
    const c = id ? await updateCustomer(actor, id, input, str(fd.get("reason")) || undefined) : await createCustomer(actor, input);
    revalidatePath("/customers");
    revalidatePath(`/customers/${c.id}`);
    return { ok: true, message: id ? "Customer updated." : "Customer created.", data: { id: c.id } };
  } catch (e) {
    return toActionResult(e) as ActionResult<{ id: string }>;
  }
}

export async function setRateAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const actor = await currentActor();
    const customerId = str(fd.get("customerId"));
    const base = formObject(fd) as unknown as RateInput;
    // One form sets one supply type; "BOTH" sessions applies the same values to morning and evening.
    const sessions = str(fd.get("session")) === "BOTH" ? (["MORNING", "EVENING"] as const) : ([str(fd.get("session"))] as ("MORNING" | "EVENING")[]);
    for (const session of sessions) await setRate(actor, customerId, { ...base, session });
    revalidatePath(`/customers/${customerId}`);
    return { ok: true, message: "Rate saved." };
  } catch (e) {
    return toActionResult(e);
  }
}
