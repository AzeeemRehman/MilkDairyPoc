/**
 * Seed: roles + permissions, the 8 expense categories, default settings and an admin user.
 * Idempotent — safe to run repeatedly.
 */
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import { ROLE_MATRIX, type RoleCode } from "../src/lib/permissions";
import { DEFAULT_SETTINGS } from "../src/lib/settings";

const prisma = new PrismaClient();

export const EXPENSE_CATEGORIES: [string, string][] = [
  ["Fodder & Feed", "چارہ و خوراک"],
  ["Milk Purchase", "دودھ کی خریداری"],
  ["Salaries & Wages", "تنخواہیں"],
  ["Transport & Fuel", "ٹرانسپورٹ و ایندھن"],
  ["Veterinary & Medicine", "ویٹرنری و ادویات"],
  ["Utilities", "بل (بجلی، گیس، پانی)"],
  ["Rent", "کرایہ"],
  ["Miscellaneous", "متفرق"],
];

export async function seed(db: PrismaClient = prisma, opts: { adminUsername?: string; adminPassword?: string } = {}) {
  for (const [code, def] of Object.entries(ROLE_MATRIX) as [RoleCode, (typeof ROLE_MATRIX)[RoleCode]][]) {
    const role = await db.role.upsert({ where: { code }, create: { code, name: def.name }, update: { name: def.name } });
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    await db.rolePermission.createMany({ data: def.permissions.map((permission) => ({ roleId: role.id, permission })) });
  }
  for (const [nameEn, nameUr] of EXPENSE_CATEGORIES) {
    await db.expenseCategory.upsert({ where: { nameEn }, create: { nameEn, nameUr }, update: {} });
  }
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.businessSetting.upsert({ where: { key }, create: { key, value }, update: {} });
  }
  const username = (opts.adminUsername ?? process.env.SEED_ADMIN_USERNAME ?? "admin").toLowerCase();
  const password = opts.adminPassword ?? process.env.SEED_ADMIN_PASSWORD ?? "change-me-now";
  if (!(await db.user.findUnique({ where: { username } }))) {
    const admin = await db.role.findUniqueOrThrow({ where: { code: "ADMIN" } });
    await db.user.create({
      data: { name: "Administrator", username, roleId: admin.id, passwordHash: await hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 }) },
    });
    console.log(`Created admin user "${username}". Change the password after the first login.`);
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("prisma/seed.ts")) {
  seed()
    .then(() => console.log("Seed complete."))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
