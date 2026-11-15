import "server-only";
import { z } from "zod";
import { prisma, transaction } from "@/lib/db";
import { conflict, forbidden, invalid, notFound } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/lib/auth";
import type { Actor } from "./types";

const password = z.string().min(MIN_PASSWORD_LENGTH, `At least ${MIN_PASSWORD_LENGTH} characters`).max(200);

export const userSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,40}$/, "3–40 letters, digits, dot, dash or underscore"),
  roleCode: z.enum(["ADMIN", "ACCOUNTANT", "DATA_ENTRY", "VIEWER"]),
  password: z.string().optional().default(""),
  isActive: z.boolean().default(true),
  locale: z.enum(["en", "ur"]).default("en"),
});
export type UserInput = z.input<typeof userSchema>;

function strip<T extends { passwordHash?: string }>(u: T) {
  const { passwordHash: _ph, ...rest } = u;
  return rest;
}

export async function createUser(actor: Actor, raw: UserInput) {
  if (!actor.permissions.has(PERMISSIONS.USERS_MANAGE)) throw forbidden();
  const i = userSchema.parse(raw);
  const pw = password.safeParse(i.password);
  if (!pw.success) throw invalid("Password is too short.", { password: pw.error.issues[0].message });
  return transaction(async (tx) => {
    if (await tx.user.findUnique({ where: { username: i.username } })) throw conflict("Username already taken.");
    const role = await tx.role.findUniqueOrThrow({ where: { code: i.roleCode } });
    const u = await tx.user.create({
      data: { name: i.name, username: i.username, roleId: role.id, isActive: i.isActive, locale: i.locale, passwordHash: await hashPassword(pw.data) },
    });
    await audit(actor.id, "CREATE", "User", u.id, { newValues: strip(u), ip: actor.ip }, tx);
    return u;
  });
}

export async function updateUser(actor: Actor, id: string, raw: UserInput) {
  if (!actor.permissions.has(PERMISSIONS.USERS_MANAGE)) throw forbidden();
  const i = userSchema.parse(raw);
  return transaction(async (tx) => {
    const old = await tx.user.findUnique({ where: { id }, include: { role: true } });
    if (!old) throw notFound("User");
    if (id === actor.id && (!i.isActive || i.roleCode !== "ADMIN")) throw invalid("You cannot deactivate or demote your own account.");
    const role = await tx.role.findUniqueOrThrow({ where: { code: i.roleCode } });
    let passwordHash: string | undefined;
    if (i.password) {
      const pw = password.safeParse(i.password);
      if (!pw.success) throw invalid("Password is too short.", { password: pw.error.issues[0].message });
      passwordHash = await hashPassword(pw.data);
    }
    const u = await tx.user.update({
      where: { id },
      data: { name: i.name, username: i.username, roleId: role.id, isActive: i.isActive, locale: i.locale, ...(passwordHash ? { passwordHash, failedLogins: 0, lockedUntil: null } : {}) },
    });
    // Revoke sessions on password change, deactivation or role change.
    if (passwordHash || !i.isActive || old.roleId !== role.id) await tx.session.deleteMany({ where: { userId: id } });
    await audit(actor.id, passwordHash ? "UPDATE_WITH_PASSWORD" : "UPDATE", "User", id, { oldValues: strip(old), newValues: strip(u), ip: actor.ip }, tx);
    return u;
  });
}

export async function changeOwnPassword(actor: Actor, current: string, next: string, verify: (h: string, p: string) => Promise<boolean>) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
  if (!(await verify(u.passwordHash, current))) throw invalid("Current password is incorrect.", { current: "Incorrect" });
  const pw = password.safeParse(next);
  if (!pw.success) throw invalid("New password is too short.", { next: pw.error.issues[0].message });
  await prisma.user.update({ where: { id: actor.id }, data: { passwordHash: await hashPassword(pw.data) } });
  await audit(actor.id, "PASSWORD_CHANGE", "User", actor.id, { ip: actor.ip });
}

export async function listUsers() {
  const users = await prisma.user.findMany({ include: { role: true }, orderBy: { name: "asc" } });
  return users.map(strip);
}
