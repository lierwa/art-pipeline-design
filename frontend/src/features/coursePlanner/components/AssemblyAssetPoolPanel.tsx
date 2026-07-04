import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Copy, LocateFixed, Plus, Trash2, Upload } from "lucide-react";

import { ConfirmActionDialog } from "../../../shared/ui/ConfirmActionDialog";
import type { AssemblyManifestDraft } from "../assembly/assemblyManifestDraft";
import type { DirectChapterAssetUploadInput } from "../api";
import { scenePackageMediaUrl } from "../scenePackageMedia";
import type { ChapterScenePackage } from "../types";
import { CoursePlannerStatusBadge } from "./CoursePlannerChrome";

type AssemblyAssetPoolPanelProps = {
  draft: AssemblyManifestDraft;
  scenePackage: ChapterScenePackage;
  alignmentRiskPlacementIds: string[];
  onAddAsset: (assetId: string) => Promise<void> | void;
  onDeleteChapterAsset: (assetId: string) => Promise<ChapterScenePackage | null>;
  onDuplicateChapterAsset?: (assetId: string) => Promise<ChapterScenePackage | null>;
  onLocatePlacement: (placementId: string) => void;
  onUploadDirectAsset: (file: File, input: DirectChapterAssetUploadInput) => Promise<ChapterScenePackage | null>;
};

export function AssemblyAssetPoolPanel({
  alignmentRiskPlacementIds,
  draft,
  onAddAsset,
  onDeleteChapterAsset,
  onDuplicateChapterAsset,
  onLocatePlacement,
  onUploadDirectAsset,
  scenePackage,
}: AssemblyAssetPoolPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedUploadTargetId, setSelectedUploadTargetId] = useState("");
  const visibleAssets = useMemo(
    () => scenePackage.chapter_assets.filter((asset) => asset.status === "available"),
    [scenePackage.chapter_assets],
  );
  const usedPlacementByAssetId = useMemo(
    () => new Map(draft.placements.map((placement) => [placement.asset_id, placement.id])),
    [draft.placements],
  );
  const alignmentRiskPlacementIdSet = useMemo(
    () => new Set(alignmentRiskPlacementIds),
    [alignmentRiskPlacementIds],
  );
  const missingEmptyScene = !draft.empty_scene_image_id;
  const targetLabels = useMemo(
    () => new Map(scenePackage.target_objects.map((item) => [item.id, item.label])),
    [scenePackage.target_objects],
  );
  const hasTargetObjects = scenePackage.target_objects.length > 0;

  useEffect(() => {
    if (selectedUploadTargetId && !targetLabels.has(selectedUploadTargetId)) {
      setSelectedUploadTargetId("");
    }
  }, [selectedUploadTargetId, targetLabels]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    // WHY: direct upload 是 Chapter Asset 的事实入口；只有用户在同一面板里明确选择目标物，
    // 才把它写成 coverage 依据。未选择时保持 Unlinked，避免自动猜测污染 ready 合同。
    await onUploadDirectAsset(file, {
      displayName: file.name.replace(/\.[^.]+$/, ""),
      linkedTargetObjectId: selectedUploadTargetId || undefined,
    });
    event.target.value = "";
  }

  return (
    <section className="chapter-studio-panel chapter-studio-panel-stack" aria-label="Assembly asset pool">
      <div className="chapter-studio-panel-heading">
        <div>
          <h2>Assets</h2>
          <p>{visibleAssets.length} available</p>
        </div>
      </div>

      <div className="chapter-studio-actions">
        {hasTargetObjects ? (
          <label className="assembly-field assembly-upload-target-field">
            <span>Target</span>
            <select
              aria-label="Upload target object"
              value={selectedUploadTargetId}
              onChange={(event) => setSelectedUploadTargetId(event.currentTarget.value)}
            >
              <option value="">Unlinked</option>
              {scenePackage.target_objects.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button type="button" className="course-planner-primary-action chapter-studio-icon-action" onClick={() => inputRef.current?.click()}>
          <Upload size={16} aria-hidden="true" />
          Upload Scene Asset
        </button>
        <input
          ref={inputRef}
          hidden
          type="file"
          accept="image/png"
          aria-label="Upload Scene Asset"
          onChange={handleFileChange}
        />
      </div>

      {missingEmptyScene ? (
        <p className="assembly-asset-pool-help">Select an Empty Scene Image to enable Add to Assembly.</p>
      ) : null}

      <div className="chapter-studio-card-list">
        {visibleAssets.map((asset) => {
          const placementId = usedPlacementByAssetId.get(asset.id) ?? null;
          const isUsed = Boolean(placementId);
          const hasAlignmentRisk = Boolean(placementId && alignmentRiskPlacementIdSet.has(placementId));
          const targetLabel = asset.linked_target_object_id ? targetLabels.get(asset.linked_target_object_id) ?? "Unknown target" : "Unlinked";

          return (
            <article key={asset.id} className="assembly-asset-row">
              <img
                className="assembly-asset-thumb"
                alt=""
                src={scenePackageMediaUrl(scenePackage.chapter_id, "chapter_assets", asset.id)}
              />
              <div className="assembly-asset-meta">
                <div className="chapter-studio-card-header">
                  <div>
                    <h3>{asset.display_name}</h3>
                    <p>{asset.original_filename}</p>
                  </div>
                  <div className="assembly-asset-status-badges">
                    <CoursePlannerStatusBadge tone={isUsed ? "info" : "neutral"}>{isUsed ? "Used" : "Unused"}</CoursePlannerStatusBadge>
                    {hasAlignmentRisk ? <CoursePlannerStatusBadge tone="warning">Alignment risk</CoursePlannerStatusBadge> : null}
                  </div>
                </div>
                <dl className="assembly-asset-details">
                  <div>
                    <dt>Target</dt>
                    <dd>{targetLabel}</dd>
                  </div>
                </dl>
              </div>
              <div className="assembly-asset-actions">
                {isUsed && placementId ? (
                  <button
                    type="button"
                    className="course-planner-secondary-action chapter-studio-icon-action"
                    onClick={() => onLocatePlacement(placementId)}
                  >
                    <LocateFixed size={16} aria-hidden="true" />
                    Locate Placement
                  </button>
                ) : (
                  <button
                    type="button"
                    className="course-planner-secondary-action chapter-studio-icon-action"
                    disabled={missingEmptyScene}
                    onClick={() => void onAddAsset(asset.id)}
                  >
                    <Plus size={16} aria-hidden="true" />
                    Add to Assembly
                  </button>
                )}
                <button
                  type="button"
                  className="course-planner-secondary-action chapter-studio-icon-action"
                  onClick={() => void onDuplicateChapterAsset?.(asset.id)}
                >
                  <Copy size={16} aria-hidden="true" />
                  Duplicate Chapter Asset
                </button>
                <ConfirmActionDialog
                  trigger={(
                    <button type="button" className="course-planner-secondary-action chapter-studio-icon-action">
                      <Trash2 size={16} aria-hidden="true" />
                      Delete Asset
                    </button>
                  )}
                  title={`Delete ${asset.display_name}?`}
                  description={isUsed
                    ? "This removes the Chapter Asset from the current asset pool and clears any placement or dependency references that still point to it. Locked Final snapshots stay intact."
                    : "This removes the Chapter Asset from the current asset pool. Locked Final snapshots stay intact."}
                  confirmLabel="Confirm delete asset"
                  onConfirm={async () => {
                    await onDeleteChapterAsset(asset.id);
                  }}
                />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
