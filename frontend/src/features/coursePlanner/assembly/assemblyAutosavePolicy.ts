import { manifestKeyOf } from "./assemblyWorkspaceState";
import type { ChapterScenePackage } from "../types";

export type AssemblyAutosavePolicyDecision =
  | "integrate-clean-server"
  | "integrate-own-save-echo"
  | "keep-local-after-older-save"
  | "server-conflict"
  | "catalog-only-refresh";

type ClassifyIncomingAssemblyManifestInput = {
  baselineManifestKey: string;
  incomingManifest: ChapterScenePackage["assembly"];
  inFlightManifestKey: string | null;
  lastAcceptedSaveManifestKey: string | null;
  lastObservedManifestKey: string;
  localPendingManifest: ChapterScenePackage["assembly"];
};

// WHY: autosave 的保存回包、后台刷新、asset catalog 刷新都从同一个 scenePackage prop 进入。
// 这里把生命周期边界收敛到纯函数，避免 canvas、asset pool、属性面板各自用局部状态推断 conflict。
export function classifyIncomingAssemblyManifest(input: ClassifyIncomingAssemblyManifestInput): AssemblyAutosavePolicyDecision {
  const incomingManifestKey = manifestKeyOf(input.incomingManifest);
  const localPendingManifestKey = manifestKeyOf(input.localPendingManifest);

  if (incomingManifestKey === input.lastObservedManifestKey) {
    return "catalog-only-refresh";
  }

  const isCleanLocalDraft = localPendingManifestKey === input.baselineManifestKey;
  const isOwnSaveEcho = incomingManifestKey === input.inFlightManifestKey
    || incomingManifestKey === input.lastAcceptedSaveManifestKey;

  if (isOwnSaveEcho) {
    return incomingManifestKey === localPendingManifestKey
      ? "integrate-own-save-echo"
      : "keep-local-after-older-save";
  }

  if (isCleanLocalDraft && input.inFlightManifestKey === null) {
    return "integrate-clean-server";
  }

  if (incomingManifestKey === input.baselineManifestKey) {
    return "catalog-only-refresh";
  }

  if (incomingManifestKey === localPendingManifestKey) {
    return "integrate-own-save-echo";
  }

  return "server-conflict";
}
