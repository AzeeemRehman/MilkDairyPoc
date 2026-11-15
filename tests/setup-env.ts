// Point every PrismaClient at the per-run test schema (set by global-setup) before any module creates one.
if (!process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL was not provided by global setup");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.UPLOAD_DIR = "./storage/test-uploads";
