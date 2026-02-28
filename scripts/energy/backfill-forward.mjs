import { spawnSync } from "node:child_process";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  console.error("Example: DATABASE_URL='postgresql://...' npm run energy:backfill-forward -- --from=2026-01-01");
  process.exit(1);
}

const fromArg = process.argv.find((arg) => arg.startsWith("--from="));
const userArg = process.argv.find((arg) => arg.startsWith("--user="));

const fromDate = fromArg?.slice("--from=".length) ?? "";
if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
  console.error("Missing or invalid --from=YYYY-MM-DD argument.");
  process.exit(1);
}

const userId = userArg?.slice("--user=".length) ?? null;
if (userId && !/^[0-9a-fA-F-]{36}$/.test(userId)) {
  console.error("Invalid --user UUID.");
  process.exit(1);
}

const sql = userId
  ? `select public.backfill_daily_energy_metrics_forward('${fromDate}'::date, '${userId}'::uuid);`
  : `select public.backfill_daily_energy_metrics_forward('${fromDate}'::date, null);`;

console.log(`Running forward-only daily energy backfill from ${fromDate}${userId ? ` for user ${userId}` : " for all users"}...`);

const result = spawnSync(
  "psql",
  ["-v", "ON_ERROR_STOP=1", databaseUrl, "-c", sql],
  { stdio: "inherit" }
);

if (result.error) {
  console.error(`Failed to run psql: ${result.error.message}`);
  process.exit(1);
}

if (typeof result.status === "number" && result.status !== 0) {
  process.exit(result.status);
}

console.log("Forward-only daily energy backfill completed.");
