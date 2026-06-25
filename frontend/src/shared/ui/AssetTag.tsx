import type { ReactNode } from "react";

export type AssetTagTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "progress"
  | "muted"
  | "queued";

type AssetTagProps = {
  children: ReactNode;
  title?: string;
  tone?: string;
};

export function AssetTag({ children, title, tone = "neutral" }: AssetTagProps) {
  const normalizedTone = normalizeAssetTagTone(tone);
  return (
    <span className={`asset-tag asset-tag-${normalizedTone}`} title={title}>
      {children}
    </span>
  );
}

function normalizeAssetTagTone(tone: string | undefined): AssetTagTone {
  switch (tone) {
    case "info":
    case "is-info":
      return "info";
    case "success":
    case "is-success":
      return "success";
    case "warning":
    case "is-warning":
      return "warning";
    case "danger":
    case "is-danger":
      return "danger";
    case "progress":
    case "is-progress":
      return "progress";
    case "muted":
    case "is-muted":
      return "muted";
    case "queued":
    case "is-queued":
      return "queued";
    default:
      return "neutral";
  }
}
