/** Who is performing a service operation. Services never read cookies; callers pass this in. */
export interface Actor {
  id: string;
  permissions: Set<string>;
  ip?: string | null;
}

/** System actor for seed scripts / tests. */
export function systemActor(id: string, permissions: string[]): Actor {
  return { id, permissions: new Set(permissions) };
}
