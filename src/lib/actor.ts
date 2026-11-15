import "server-only";
import { requestIp, requireUser, type CurrentUser } from "./auth";
import type { Permission } from "./permissions";
import type { Actor } from "@/server/services/types";

export async function actorFor(user: CurrentUser): Promise<Actor> {
  return { id: user.id, permissions: user.permissions, ip: await requestIp() };
}

/** Current signed-in user as a service Actor (throws when signed out / lacking permission). */
export async function currentActor(...anyOf: Permission[]): Promise<Actor> {
  return actorFor(await requireUser(...anyOf));
}
