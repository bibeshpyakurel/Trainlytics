import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const planPath = process.env.DB_PLAN_PATH ?? "db/plan.json";

function walkSqlFiles(dir) {
  const out = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walkSqlFiles(full));
    } else if (st.isFile() && full.endsWith(".sql")) {
      out.push(path.normalize(full));
    }
  }
  return out;
}

if (!existsSync(planPath)) {
  console.error(`DB plan file not found: ${planPath}`);
  process.exit(1);
}

const plan = JSON.parse(readFileSync(planPath, "utf8"));
const phases = Array.isArray(plan.phases) ? plan.phases : [];
const auditFiles = Array.isArray(plan.audit_files) ? plan.audit_files : [];

const plannedApplyFiles = phases.flatMap((phase) => phase.files ?? []).map((f) => path.normalize(f));
const plannedAuditFiles = auditFiles.map((f) => path.normalize(f));
const plannedAll = new Set([...plannedApplyFiles, ...plannedAuditFiles]);

if (plannedApplyFiles.length === 0) {
  console.error("db/plan.json does not include any phase files.");
  process.exit(1);
}

for (const phase of phases) {
  if (!Array.isArray(phase.files) || phase.files.length === 0) {
    console.error(`Phase "${phase.name ?? "unknown"}" must include at least one file.`);
    process.exit(1);
  }
}

for (const file of plannedAll) {
  if (!existsSync(file)) {
    console.error(`Planned file does not exist: ${file}`);
    process.exit(1);
  }
}

const allDbSql = walkSqlFiles("db");
const unmanaged = allDbSql.filter((file) => !plannedAll.has(path.normalize(file)));
if (unmanaged.length > 0) {
  console.error("Unmanaged SQL files found (missing from db/plan.json):");
  unmanaged.forEach((file) => console.error(`- ${file}`));
  process.exit(1);
}

const seen = new Set();
for (const file of [...plannedApplyFiles, ...plannedAuditFiles]) {
  if (seen.has(file)) {
    console.error(`Duplicate entry in db/plan.json: ${file}`);
    process.exit(1);
  }
  seen.add(file);
}

console.log("DB plan is valid and covers all SQL files.");
