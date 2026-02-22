import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const planPath = process.env.DB_PLAN_PATH ?? "db/plan.json";
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required to run DB migrations.");
  console.error("Example: DATABASE_URL='postgresql://...' npm run db:migrate");
  process.exit(1);
}

if (!existsSync(planPath)) {
  console.error(`DB plan file not found: ${planPath}`);
  process.exit(1);
}

const raw = readFileSync(planPath, "utf8");
const plan = JSON.parse(raw);
const phases = Array.isArray(plan.phases) ? plan.phases : [];
const files = phases.flatMap((phase) => phase.files ?? []);

if (files.length === 0) {
  console.error(`No migration files defined in plan: ${planPath}`);
  process.exit(1);
}

for (const file of files) {
  const absoluteFile = path.resolve(file);
  if (!existsSync(absoluteFile)) {
    console.error(`Migration file missing: ${file}`);
    process.exit(1);
  }

  console.log(`\n==> Applying ${file}`);
  const result = spawnSync(
    "psql",
    ["-v", "ON_ERROR_STOP=1", databaseUrl, "-f", absoluteFile],
    { stdio: "inherit" }
  );

  if (result.error) {
    console.error(`Failed to run psql for ${file}: ${result.error.message}`);
    process.exit(1);
  }

  if (typeof result.status === "number" && result.status !== 0) {
    console.error(`Migration failed for ${file} (exit code ${result.status}).`);
    process.exit(result.status);
  }
}

console.log("\nDB migration plan completed successfully.");
