const fs = require("node:fs");
const path = require("node:path");
const { readJson, writeJson } = require("./json");
const { runDir } = require("./run-store");

function createRepairJobs({ projectRoot, runId }) {
  const base = runDir(projectRoot, runId);
  const report = readJson(path.join(base, "review", "review_report.json"));
  const repairs = report.assets
    .filter((item) => item.status === "repair_required")
    .map((item) => ({
      assetId: item.assetId,
      issues: item.issues,
      status: "pending",
      task: `tasks/repairs/${item.assetId}.md`
    }));

  for (const repair of repairs) {
    writeJson(path.join(base, "jobs", "repairs", `${repair.assetId}.json`), repair);
    fs.mkdirSync(path.join(base, "tasks", "repairs"), { recursive: true });
    fs.writeFileSync(path.join(base, repair.task), [
      `Repair asset ${repair.assetId} for run ${runId}.`,
      `Issues: ${repair.issues.join("; ")}`,
      "Regenerate the PNG at the original asset output path.",
      "Write an updated result JSON when done."
    ].join("\n"), "utf8");
  }

  return repairs;
}

module.exports = { createRepairJobs };
