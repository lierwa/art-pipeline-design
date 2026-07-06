import { type ChangeEvent, type DragEvent, type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Copy, ImagePlus, LocateFixed, Plus, Trash2, Upload } from "lucide-react";

import { ConfirmActionDialog } from "../../../shared/ui/ConfirmActionDialog";
import type { AssemblyManifestDraft } from "../assembly/assemblyManifestDraft";
import type { DirectChapterAssetUploadInput } from "../api";
import { scenePackageMediaUrl } from "../scenePackageMedia";
import type { ChapterScenePackage } from "../types";
import {
  AssetPoolBrowserControls,
  filterAssetPool,
  readableAssetPoolAssetName,
} from "./assemblyAssetPoolBrowser";
import { writeAssemblyAssetDragData } from "./assemblyCanvasControls";
import { CoursePlannerStatusBadge } from "./CoursePlannerChrome";
import { isGeneratedLineage } from "./generatedChapterAssetsModel";

type AssemblyAssetPoolPanelProps = {
  draft: AssemblyManifestDraft;
  scenePackage: ChapterScenePackage;
  alignmentRiskPlacementIds: string[];
  onAddAsset: (assetId: string, center?: { x: number; y: number }) => Promise<void> | void;
  onDeleteChapterAsset: (assetId: string) => Promise<ChapterScenePackage | null>;
  onDuplicateChapterAsset?: (assetId: string) => Promise<ChapterScenePackage | null>;
  onOpenGeneratedAssets: () => void;
  onLocatePlacement: (placementId: string) => void;
  onUploadDirectAsset: (file: File, input: DirectChapterAssetUploadInput) => Promise<ChapterScenePackage | null>;
};

type ChapterAsset = ChapterScenePackage["chapter_assets"][number];

export function AssemblyAssetPoolPanel({
  alignmentRiskPlacementIds,
  draft,
  onAddAsset,
  onDeleteChapterAsset,
  onDuplicateChapterAsset,
  onOpenGeneratedAssets,
  onLocatePlacement,
  onUploadDirectAsset,
  scenePackage,
}: AssemblyAssetPoolPanelProps) {
  const [assetQuery, setAssetQuery] = useState("");
  const visibleAssets = useMemo(
    () => scenePackage.chapter_assets.filter((asset) => asset.status === "available"),
    [scenePackage.chapter_assets],
  );
  const placementSummaryByAssetId = useMemo(
    () => draft.placements.reduce((summary, placement) => {
      const existing = summary.get(placement.asset_id);
      summary.set(placement.asset_id, {
        count: (existing?.count ?? 0) + 1,
        firstPlacementId: existing?.firstPlacementId ?? placement.id,
      });
      return summary;
    }, new Map<string, { count: number; firstPlacementId: string }>()),
    [draft.placements],
  );
  const riskPlacementIdSet = useMemo(() => new Set(alignmentRiskPlacementIds), [alignmentRiskPlacementIds]);
  const targetLabels = useMemo(
    () => new Map(scenePackage.target_objects.map((item) => [item.id, item.label])),
    [scenePackage.target_objects],
  );
  const filteredAssets = useMemo(
    () => filterAssetPool(visibleAssets, assetQuery),
    [assetQuery, visibleAssets],
  );
  const missingEmptyScene = !draft.empty_scene_image_id;

  return (
    <section className="chapter-studio-panel chapter-studio-panel-stack" aria-label="Assembly asset pool">
      <AssetPoolHeader assetCount={visibleAssets.length} />
      <AssetPoolBrowserControls
        assetQuery={assetQuery}
        onQueryChange={setAssetQuery}
        trailingControls={(
          <AssetPoolToolbarControls
            onOpenGeneratedAssets={onOpenGeneratedAssets}
            onUploadDirectAsset={onUploadDirectAsset}
            scenePackage={scenePackage}
            targetLabels={targetLabels}
          />
        )}
      />
      {missingEmptyScene ? (
        <p className="assembly-asset-pool-help">Select an Empty Scene Image to enable Add to Assembly.</p>
      ) : null}
      <AssetPoolList
        assets={filteredAssets}
        missingEmptyScene={missingEmptyScene}
        onAddAsset={onAddAsset}
        onDeleteChapterAsset={onDeleteChapterAsset}
        onDuplicateChapterAsset={onDuplicateChapterAsset}
        onLocatePlacement={onLocatePlacement}
        placementSummaryByAssetId={placementSummaryByAssetId}
        riskPlacementIdSet={riskPlacementIdSet}
        scenePackage={scenePackage}
      />
    </section>
  );
}

function AssetPoolHeader({ assetCount }: { assetCount: number }) {
  return (
    <div className="chapter-studio-panel-heading">
      <div>
        <h2>Asset Pool</h2>
        <p>{assetCount} assets</p>
      </div>
    </div>
  );
}

function AssetPoolToolbarControls({
  onOpenGeneratedAssets,
  onUploadDirectAsset,
  scenePackage,
  targetLabels,
}: {
  onOpenGeneratedAssets: AssemblyAssetPoolPanelProps["onOpenGeneratedAssets"];
  onUploadDirectAsset: AssemblyAssetPoolPanelProps["onUploadDirectAsset"];
  scenePackage: ChapterScenePackage;
  targetLabels: Map<string, string>;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedUploadTargetId, setSelectedUploadTargetId] = useState("");

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
    // 才把它写成 coverage 依据。未选择时不写 target linkage，避免自动猜测污染 ready 合同。
    await onUploadDirectAsset(file, {
      displayName: file.name.replace(/\.[^.]+$/, ""),
      linkedTargetObjectId: selectedUploadTargetId || undefined,
    });
    event.target.value = "";
  }

  return (
    <div className="chapter-studio-actions assembly-asset-pool-actions">
      <button
        type="button"
        className="course-planner-primary-action chapter-studio-icon-action assembly-editor-icon-button"
        aria-label="Import generated assets"
        title="Import generated assets"
        onClick={onOpenGeneratedAssets}
      >
        <ImagePlus size={16} aria-hidden="true" />
      </button>
      {scenePackage.target_objects.length > 0 ? (
        <label className="assembly-field assembly-upload-target-field">
          <span>Target</span>
          <select
            aria-label="Upload target object"
            value={selectedUploadTargetId}
            onChange={(event) => setSelectedUploadTargetId(event.currentTarget.value)}
          >
            <option value="">No target object</option>
            {scenePackage.target_objects.map((target) => (
              <option key={target.id} value={target.id}>
                {target.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <button
        type="button"
        className="course-planner-secondary-action chapter-studio-icon-action assembly-editor-icon-button"
        aria-label="Upload Scene Asset"
        title="Upload Scene Asset"
        onClick={() => inputRef.current?.click()}
      >
        <Upload size={16} aria-hidden="true" />
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
  );
}

function AssetPoolList({
  assets,
  missingEmptyScene,
  onAddAsset,
  onDeleteChapterAsset,
  onDuplicateChapterAsset,
  onLocatePlacement,
  placementSummaryByAssetId,
  riskPlacementIdSet,
  scenePackage,
}: {
  assets: ChapterAsset[];
  missingEmptyScene: boolean;
  onAddAsset: AssemblyAssetPoolPanelProps["onAddAsset"];
  onDeleteChapterAsset: AssemblyAssetPoolPanelProps["onDeleteChapterAsset"];
  onDuplicateChapterAsset: AssemblyAssetPoolPanelProps["onDuplicateChapterAsset"];
  onLocatePlacement: AssemblyAssetPoolPanelProps["onLocatePlacement"];
  placementSummaryByAssetId: Map<string, { count: number; firstPlacementId: string }>;
  riskPlacementIdSet: Set<string>;
  scenePackage: ChapterScenePackage;
}) {
  const generatedAssets = assets.filter(isGeneratedLineage);
  const uploadedAssets = assets.filter((asset) => !isGeneratedLineage(asset));

  return (
    <div className="assembly-asset-pool-groups">
      <AssetPoolGroup
        assets={generatedAssets}
        label="Generated assets"
        missingEmptyScene={missingEmptyScene}
        onAddAsset={onAddAsset}
        onDeleteChapterAsset={onDeleteChapterAsset}
        onDuplicateChapterAsset={onDuplicateChapterAsset}
        onLocatePlacement={onLocatePlacement}
        placementSummaryByAssetId={placementSummaryByAssetId}
        riskPlacementIdSet={riskPlacementIdSet}
        scenePackage={scenePackage}
      />
      <AssetPoolGroup
        assets={uploadedAssets}
        label="Uploads"
        missingEmptyScene={missingEmptyScene}
        onAddAsset={onAddAsset}
        onDeleteChapterAsset={onDeleteChapterAsset}
        onDuplicateChapterAsset={onDuplicateChapterAsset}
        onLocatePlacement={onLocatePlacement}
        placementSummaryByAssetId={placementSummaryByAssetId}
        riskPlacementIdSet={riskPlacementIdSet}
        scenePackage={scenePackage}
      />
    </div>
  );
}

function AssetPoolGroup({
  assets,
  label,
  missingEmptyScene,
  onAddAsset,
  onDeleteChapterAsset,
  onDuplicateChapterAsset,
  onLocatePlacement,
  placementSummaryByAssetId,
  riskPlacementIdSet,
  scenePackage,
}: {
  assets: ChapterAsset[];
  label: string;
  missingEmptyScene: boolean;
  onAddAsset: AssemblyAssetPoolPanelProps["onAddAsset"];
  onDeleteChapterAsset: AssemblyAssetPoolPanelProps["onDeleteChapterAsset"];
  onDuplicateChapterAsset: AssemblyAssetPoolPanelProps["onDuplicateChapterAsset"];
  onLocatePlacement: AssemblyAssetPoolPanelProps["onLocatePlacement"];
  placementSummaryByAssetId: Map<string, { count: number; firstPlacementId: string }>;
  riskPlacementIdSet: Set<string>;
  scenePackage: ChapterScenePackage;
}) {
  if (assets.length === 0) {
    return null;
  }

  return (
    <section className="assembly-asset-pool-group" role="group" aria-label={label}>
      <div className="assembly-asset-pool-group-heading">
        <h3>{label}</h3>
        <span>{assets.length}</span>
      </div>
      <div className="chapter-studio-card-list assembly-asset-list">
        {assets.map((asset) => {
          const placementSummary = placementSummaryByAssetId.get(asset.id);
          const placementId = placementSummary?.firstPlacementId ?? null;
          return (
            <AssetPoolCard
              key={asset.id}
              asset={asset}
              missingEmptyScene={missingEmptyScene}
              onAddAsset={onAddAsset}
              onDeleteChapterAsset={onDeleteChapterAsset}
              onDuplicateChapterAsset={onDuplicateChapterAsset}
              onLocatePlacement={onLocatePlacement}
              placementId={placementId}
              scenePackage={scenePackage}
              usageCount={placementSummary?.count ?? 0}
              hasAlignmentRisk={Boolean(placementId && riskPlacementIdSet.has(placementId))}
            />
          );
        })}
      </div>
    </section>
  );
}

function AssetPoolCard({
  asset,
  hasAlignmentRisk,
  missingEmptyScene,
  onAddAsset,
  onDeleteChapterAsset,
  onDuplicateChapterAsset,
  onLocatePlacement,
  placementId,
  scenePackage,
  usageCount,
}: {
  asset: ChapterAsset;
  hasAlignmentRisk: boolean;
  missingEmptyScene: boolean;
  onAddAsset: AssemblyAssetPoolPanelProps["onAddAsset"];
  onDeleteChapterAsset: AssemblyAssetPoolPanelProps["onDeleteChapterAsset"];
  onDuplicateChapterAsset: AssemblyAssetPoolPanelProps["onDuplicateChapterAsset"];
  onLocatePlacement: AssemblyAssetPoolPanelProps["onLocatePlacement"];
  placementId: string | null;
  scenePackage: ChapterScenePackage;
  usageCount: number;
}) {
  const assetName = readableAssetPoolAssetName(asset);
  const canLocate = Boolean(placementId);
  const canUsePrimaryCardAction = canLocate || !missingEmptyScene;
  const primaryActionLabel = canLocate ? `Locate ${assetName}` : `Add ${assetName} to Assembly`;

  function handlePrimaryAction() {
    if (canLocate && placementId) {
      onLocatePlacement(placementId);
      return;
    }
    if (!missingEmptyScene) {
      void onAddAsset(asset.id);
    }
  }

  function handlePrimaryKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    handlePrimaryAction();
  }

  return (
    <article
      className={`assembly-asset-row${canUsePrimaryCardAction ? " assembly-asset-row-actionable" : ""}`}
      aria-label={canUsePrimaryCardAction ? primaryActionLabel : undefined}
      draggable={!missingEmptyScene}
      tabIndex={canUsePrimaryCardAction ? 0 : undefined}
      onClick={canUsePrimaryCardAction ? handlePrimaryAction : undefined}
      onDragStart={(event) => {
        if (!missingEmptyScene) {
          writeAssemblyAssetDragData(event.dataTransfer, asset.id);
        }
      }}
      onKeyDown={canUsePrimaryCardAction ? handlePrimaryKeyDown : undefined}
    >
      <img
        className="assembly-asset-thumb"
        alt=""
        src={scenePackageMediaUrl(scenePackage.chapter_id, "chapter_assets", asset.id)}
      />
      <div className="assembly-asset-meta">
        <div className="chapter-studio-card-header">
          <div>
            <h3 title={assetName}>{assetName}</h3>
            <p>{asset.width} x {asset.height}</p>
          </div>
          <AssetUsageSummary hasAlignmentRisk={hasAlignmentRisk} usageCount={usageCount} />
        </div>
      </div>
      <AssetActionButtons
        asset={asset}
        assetName={assetName}
        missingEmptyScene={missingEmptyScene}
        onAddAsset={onAddAsset}
        onDeleteChapterAsset={onDeleteChapterAsset}
        onDuplicateChapterAsset={onDuplicateChapterAsset}
        onLocatePlacement={onLocatePlacement}
        placementId={placementId}
      />
    </article>
  );
}

function AssetUsageSummary({
  hasAlignmentRisk,
  usageCount,
}: {
  hasAlignmentRisk: boolean;
  usageCount: number;
}) {
  return (
    <div className="assembly-asset-status-dots">
      <span className="assembly-asset-usage-count">{usageCount} {usageCount === 1 ? "use" : "uses"}</span>
      {hasAlignmentRisk ? <CoursePlannerStatusBadge tone="warning">Alignment risk</CoursePlannerStatusBadge> : null}
    </div>
  );
}

function AssetActionButtons({
  asset,
  assetName,
  missingEmptyScene,
  onAddAsset,
  onDeleteChapterAsset,
  onDuplicateChapterAsset,
  onLocatePlacement,
  placementId,
}: {
  asset: ChapterAsset;
  assetName: string;
  missingEmptyScene: boolean;
  onAddAsset: AssemblyAssetPoolPanelProps["onAddAsset"];
  onDeleteChapterAsset: AssemblyAssetPoolPanelProps["onDeleteChapterAsset"];
  onDuplicateChapterAsset: AssemblyAssetPoolPanelProps["onDuplicateChapterAsset"];
  onLocatePlacement: AssemblyAssetPoolPanelProps["onLocatePlacement"];
  placementId: string | null;
}) {
  return (
    <div
      className="assembly-asset-actions"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <IconActionButton
        label="Add to Assembly"
        disabled={missingEmptyScene}
        draggable={!missingEmptyScene}
        onDragStart={(event) => {
          if (!missingEmptyScene) {
            writeAssemblyAssetDragData(event.dataTransfer, asset.id);
          }
        }}
        onClick={() => void onAddAsset(asset.id)}
        icon={<Plus size={16} aria-hidden="true" />}
      />
      {placementId ? (
        <IconActionButton label="Locate Placement" onClick={() => onLocatePlacement(placementId)} icon={<LocateFixed size={16} aria-hidden="true" />} />
      ) : null}
      {onDuplicateChapterAsset ? (
        <IconActionButton
          label="Duplicate Chapter Asset"
          onClick={() => void onDuplicateChapterAsset(asset.id)}
          icon={<Copy size={16} aria-hidden="true" />}
        />
      ) : null}
      <ConfirmActionDialog
        trigger={(
          <button
            type="button"
            className="course-planner-secondary-action chapter-studio-icon-action assembly-editor-icon-button"
            aria-label="Delete Asset"
            title="Delete Asset"
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
        )}
        title={`Delete ${assetName}?`}
        description={placementId
          ? "This removes the Chapter Asset from the current asset pool and clears any placement or dependency references that still point to it. Locked Final snapshots stay intact."
          : "This removes the Chapter Asset from the current asset pool. Locked Final snapshots stay intact."}
        confirmLabel="Confirm delete asset"
        onConfirm={async () => {
          await onDeleteChapterAsset(asset.id);
        }}
      />
    </div>
  );
}

function IconActionButton({
  disabled,
  draggable,
  icon,
  label,
  onClick,
  onDragStart,
}: {
  disabled?: boolean;
  draggable?: boolean;
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  onDragStart?: (event: DragEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      className="course-planner-secondary-action chapter-studio-icon-action assembly-editor-icon-button"
      aria-label={label}
      title={label}
      disabled={disabled}
      draggable={draggable}
      onClick={onClick}
      onDragStart={onDragStart}
    >
      {icon}
    </button>
  );
}
