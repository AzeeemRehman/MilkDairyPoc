/**
 * Local PostgreSQL 16 without Docker (development / tests on a PC where Docker is not available).
 * Listens on the same port and credentials as docker-compose's `db` service, so .env works for both.
 *
 *   npm run db:local        # starts and keeps running (Ctrl+C to stop)
 */
import EmbeddedPostgres from "embedded-postgres";
import fs from "node:fs";
import path from "node:path";

const dataDir = path.resolve("storage/pgdata");
const fresh = !fs.existsSync(path.join(dataDir, "PG_VERSION"));

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "dairy",
  password: "dairy",
  port: 5433,
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: () => {},
});

async function main() {
  if (fresh) await pg.initialise();
  await pg.start();
  for (const db of ["dairy", "dairy_test"]) {
    try {
      await pg.createDatabase(db);
      console.log(`created database ${db}`);
    } catch {
      /* already exists */
    }
  }
  console.log("PostgreSQL 16 running on localhost:5433 (user dairy). Ctrl+C to stop.");
  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  setInterval(() => {}, 1 << 30);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
