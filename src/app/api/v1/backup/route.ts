import { spawn } from "node:child_process";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** Streams a pg_dump (custom format). Needs `pg_dump` on PATH or PG_DUMP_PATH (the Docker image installs it). */
export async function GET() {
  let user;
  try {
    user = await requireUser(PERMISSIONS.BACKUP_MANAGE);
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
  const url = new URL(process.env.DATABASE_URL ?? "");
  url.search = ""; // drop ?schema=… which pg_dump does not understand
  const bin = process.env.PG_DUMP_PATH || "pg_dump";
  const child = spawn(bin, ["-Fc", "--dbname", url.toString()], { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d));
  const ok = await new Promise<boolean>((resolve) => {
    child.once("error", () => resolve(false));
    child.stdout.once("readable", () => resolve(true));
    child.once("exit", (code) => resolve(code === 0));
  });
  if (!ok) return new Response(`Backup failed: pg_dump is not available on this server. ${stderr}`, { status: 500 });
  await audit(user.id, "BACKUP_DOWNLOAD", "System", null);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const stream = new ReadableStream({
    start(controller) {
      child.stdout.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      child.stdout.on("end", () => controller.close());
      child.on("error", (e) => controller.error(e));
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="dairy-${stamp}.dump"`, "Cache-Control": "no-store" },
  });
}
