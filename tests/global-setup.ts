import { execSync } from "node:child_process";
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";

/**
 * Each test run migrates a brand-new, uniquely named schema in the test database
 * (TEST_DATABASE_URL) and drops only that schema afterwards. Existing data is never touched.
 */
export default function setup() {
  let base = process.env.TEST_DATABASE_URL;
  if (!base && fs.existsSync(".env")) {
    base = /^TEST_DATABASE_URL="?([^"\r\n]+)"?/m.exec(fs.readFileSync(".env", "utf8"))?.[1];
  }
  if (!base) throw new Error("TEST_DATABASE_URL is not set");
  const schema = `test_${Date.now()}`;
  const url = new URL(base);
  url.searchParams.set("schema", schema);
  process.env.TEST_DATABASE_URL = url.toString();
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: url.toString() } });

  return async () => {
    const db = new PrismaClient({ datasourceUrl: base });
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.$disconnect();
  };
}
