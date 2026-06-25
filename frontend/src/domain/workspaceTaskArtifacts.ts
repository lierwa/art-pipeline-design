export type WorkspaceTaskArtifactDetail = {
  key: string;
  label: string;
  value: string;
};

export type CodexFinalQualityStatus = "pending" | "passed" | "failed";

export type CodexFinalQualityBadge = {
  label: string;
  status: CodexFinalQualityStatus;
  tone: string;
};

const CODEX_FINAL_AGENT_ARTIFACTS: Array<[string, string]> = [
  ["manifestPath", "Manifest"],
  ["handoffPath", "Agent handoff"],
  ["briefImagePath", "Brief image"],
  ["promptPath", "Prompt"],
  ["rawOutputPath", "Raw output"],
];

export function codexFinalAgentArtifactDetails(
  artifactPaths: Record<string, unknown> | null | undefined,
): WorkspaceTaskArtifactDetail[] {
  return CODEX_FINAL_AGENT_ARTIFACTS.flatMap(([key, label]) => {
    const value = artifactString(artifactPaths, key);
    if (!value) {
      return [];
    }
    // WHY: 后端 artifactPaths 是任务/agent 交接协议；这里只做白名单投影，
    // 避免 UI 把临时字段或大块 generation 数据误展示成操作指引。
    return [{ key, label, value }];
  });
}

export function codexFinalQualityArtifactBadge(
  artifactPaths: Record<string, unknown> | null | undefined,
): CodexFinalQualityBadge | null {
  const status = codexFinalQualityStatus(artifactPaths);
  if (!status) {
    return null;
  }
  // WHY: qualityStatus 是最终候选的 QA 协议状态；即使任务 item 本身 succeeded，
  // failed 候选也需要以修复语义呈现，避免操作员误读成可导出的 Done。
  switch (status) {
    case "failed":
      return { label: "QA failed", status, tone: "danger" };
    case "passed":
      return { label: "QA passed", status, tone: "success" };
    case "pending":
      return { label: "QA pending", status, tone: "queued" };
  }
}

export function codexFinalRepairNote(
  artifactPaths: Record<string, unknown> | null | undefined,
): string | null {
  return artifactString(artifactPaths, "repairNote");
}

export function codexFinalFailedCandidatePath(
  artifactPaths: Record<string, unknown> | null | undefined,
): string | null {
  if (codexFinalQualityStatus(artifactPaths) !== "failed") {
    return null;
  }
  return artifactString(artifactPaths, "candidateOutputPath")
    ?? artifactString(artifactPaths, "finalOutputPath");
}

function codexFinalQualityStatus(
  artifactPaths: Record<string, unknown> | null | undefined,
): CodexFinalQualityStatus | null {
  const value = artifactString(artifactPaths, "qualityStatus");
  if (value === "pending" || value === "passed" || value === "failed") {
    return value;
  }
  return null;
}

function artifactString(
  artifactPaths: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = artifactPaths?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
