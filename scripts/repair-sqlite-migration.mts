import { createRequire } from "node:module";
import { PrismaPg } from "@prisma/adapter-pg";

const require = createRequire(import.meta.url);
const { repairSqliteMigration } =
  require("./lib/repair-sqlite-migration.ts") as typeof import("./lib/repair-sqlite-migration");
const { PrismaClient } =
  require("@prisma/client") as typeof import("@prisma/client");
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--apply"))
  throw new Error("Usage: repair-sqlite-migration.mts [--apply]");
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
try {
  console.log(
    JSON.stringify(await repairSqliteMigration(db, args.includes("--apply"))),
  );
} finally {
  await db.$disconnect();
}
