import type { PromptVersion } from "../types";

// WHY: PromptVersion.status 是存储/API 协议；UI 文案必须只有一个出口，避免不同面板暴露 raw enum。
export function promptVersionStatusLabel(status: PromptVersion["status"]): string {
  const labels: Record<PromptVersion["status"], string> = {
    draft: "Draft",
    prompt_ready: "Prompt ready",
    has_attempts: "Has attempts",
    adopted: "Adopted",
    archived: "Archived",
  };
  return labels[status];
}

export function promptVersionAttemptCountLabel(count: number): string {
  return `${count} ${count === 1 ? "attempt" : "attempts"}`;
}
