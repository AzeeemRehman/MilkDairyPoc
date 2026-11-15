import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { hash, verify } from "@node-rs/argon2";
import { prisma } from "./db";
import { forbidden } from "./errors";
import type { Permission } from "./permissions";
import { audit } from "./audit";

const COOKIE = "dairy_session";
const SESSION_DAYS = 7;
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
export const MIN_PASSWORD_LENGTH = 8;

export interface CurrentUser {
  id: string;
  name: string;
  username: string;
  roleCode: string;
  roleName: string;
  locale: string;
  permissions: Set<string>;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

// argon2id (the @node-rs/argon2 default algorithm)
export const hashPassword = (pw: string) => hash(pw, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
export const verifyPassword = (h: string, pw: string) => verify(h, pw);

async function clientInfo() {
  const h = await headers();
  return { ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, userAgent: h.get("user-agent") };
}

export async function login(username: string, password: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const user = await prisma.user.findUnique({ where: { username: username.trim().toLowerCase() } });
  const generic = { ok: false as const, message: "Invalid username or password." };
  const { ip, userAgent } = await clientInfo();
  if (!user || !user.isActive) {
    await audit(null, "LOGIN_FAILED", "User", null, { newValues: { username }, ip });
    return generic;
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { ok: false, message: "Account temporarily locked after repeated failed logins. Try again later." };
  }
  if (!(await verifyPassword(user.passwordHash, password))) {
    const failed = user.failedLogins + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLogins: failed >= MAX_FAILED ? 0 : failed,
        lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60000) : null,
      },
    });
    await audit(user.id, "LOGIN_FAILED", "User", user.id, { ip });
    return generic;
  }
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
  await prisma.$transaction([
    prisma.session.create({ data: { id: sha256(token), userId: user.id, expiresAt, ip, userAgent } }),
    prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), failedLogins: 0, lockedUntil: null } }),
  ]);
  await audit(user.id, "LOGIN", "User", user.id, { ip });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return { ok: true };
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { id: sha256(token) } });
  jar.delete(COOKIE);
}

/** Revoke every session of a user (password change, deactivation). */
export async function revokeSessions(userId: string, exceptCurrent = false) {
  const token = exceptCurrent ? (await cookies()).get(COOKIE)?.value : undefined;
  await prisma.session.deleteMany({ where: { userId, ...(token ? { NOT: { id: sha256(token) } } : {}) } });
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { id: sha256(token) },
    include: { user: { include: { role: { include: { permissions: true } } } } },
  });
  if (!session || session.expiresAt < new Date() || !session.user.isActive) return null;
  const u = session.user;
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    roleCode: u.role.code,
    roleName: u.role.name,
    locale: u.locale,
    permissions: new Set(u.role.permissions.map((p) => p.permission)),
  };
});

/** For pages: redirect to login when signed out, 403 page when lacking permission. */
export async function requirePage(permission?: Permission): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (permission && !user.permissions.has(permission)) redirect("/forbidden");
  return user;
}

/** For server actions / API routes: throws AppError instead of redirecting. */
export async function requireUser(...anyOf: Permission[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw forbidden("Your session has expired. Please sign in again.");
  if (anyOf.length && !anyOf.some((p) => user.permissions.has(p))) throw forbidden();
  return user;
}

export async function requestIp(): Promise<string | null> {
  return (await clientInfo()).ip;
}
