import { type ChangeEvent, type DragEvent, type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, ImagePlus, Plus, Upload } from "lucide-react";

import type { DirectChapterAssetUploadInput } from "../api";
import { scenePackageMediaUrl } from "../scenePackageMedia";
import type { ChapterScenePackage } from "../types";
import {
  assetDimensionLabel,
  buildReadableAssetPoolAssetNames,
  readableAssetPoolAssetName,
} from "./assemblyAssetPoolBrowser";
import { writeAssemblyAssetDragData } from "./assemblyCanvasControls";
import { AssemblyAssetCardActions } from "./AssemblyAssetCardActions";
import { CoursePlannerStatusBadge } from "./CoursePlannerChrome";
import { isGeneratedLineage } from "./generatedChapterAssetsModel";

type ChapterAsset = ChapterScenePackage["chapter_assets"][number];

export type AssetPlacementSummary = {
  count: number;
  firstPlacementId: string;
};

export type AssetPoolActionHandlers = {
  onAddAsset: (assetId: string, center?: { x: number; y: number }) => Promise<void> | void;
  onDeleteChapterAsset: (assetId: string) => Promise<ChapterScenePackage | null>;
  onDuplicateChapterAsset?: (assetId: string) => Promise<ChapterScenePackage | null>;
  onLocatePlacement: (placementId: string) => void;
};

type AssetPoolUploadHandler = (
  file: File,
  input: DirectChapterAssetUploadInput,
) => Promise<ChapterScenePackage | null>;

export function AssetPoolToolbarControls({
  onOpenGeneratedAssets,
}: {
  onOpenGeneratedAssets: () => void;
}) {
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
    </div>
  );
}

export function AssetPoolUploadFooter({
  onUploadDirectAsset,
  scenePackage,
  targetLabels,
}: {
  onUploadDirectAsset: AssetPoolUploadHandler;
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
    <div className="assembly-asset-pool-upload-footer">
      <div className="assembly-asset-pool-upload-options">
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
      </div>
      <button
        type="button"
        className="course-planner-secondary-action assembly-asset-pool-upload-button"
        onClick={() => inputRef.current?.click()}
      >
        <Upload size={16} aria-hidden="true" />
        <span>Upload images</span>
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

export function AssetPoolList({
  assets,
  collapsedGroupLabels,
  missingEmptyScene,
  onAddAsset,
  onDeleteChapterAsset,
  onDuplicateChapterAsset,
  onLocatePlacement,
  onToggleGroup,
  placementSummaryByAssetId,
  riskPlacementIdSet,
  scenePackage,
}: {
  assets: ChapterAsset[];
  collapsedGroupLabels: ReadonlySet<string>;
  missingEmptyScene: boolean;
  onToggleGroup: (label: string) => void;
  placementSummaryByAssetId: Map<string, AssetPlacementSummary>;
  riskPlacementIdSet: Set<string>;
  scenePackage: ChapterScenePackage;
} & AssetPoolActionHandlers) {
  const generatedAssets = assets.filter(isGeneratedLineage);
  const uploadedAssets = assets.filter((asset) => !isGeneratedLineage(asset));
  const assetNameById = buildReadableAssetPoolAssetNames(assets);

  return (
    <div className="assembly-asset-pool-groups">
      <AssetPoolGroup
        assets={generatedAssets}
        assetNameById={assetNameById}
        isCollapsed={collapsedGroupLabels.has("Generated assets")}
        label="Generated assets"
        missingEmptyScene={missingEmptyScene}
        onAddAsset={onAddAsset}
        onDeleteChapterAsset={onDeleteChapterAsset}
        onDuplicateChapterAsset={onDuplicateChapterAsset}
        onLocatePlacement={onLocatePlacement}
        onToggleCollapsed={() => onToggleGroup("Generated assets")}
        placementSummaryByAssetId={placementSummaryByAssetId}
        riskPlacementIdSet={riskPlacementIdSet}
        scenePackage={scenePackage}
      />
      <AssetPoolGroup
        assets={uploadedAssets}
        assetNameById={assetNameById}
        isCollapsed={collapsedGroupLabels.has("Uploads")}
        label="Uploads"
        missingEmptyScene={missingEmptyScene}
        onAddAsset={onAddAsset}
        onDeleteChapterAsset={onDeleteChapterAsset}
        onDuplicateChapterAsset={onDuplicateChapterAsset}
        onLocatePlacement={onLocatePlacement}
        onToggleCollapsed={() => onToggleGroup("Uploads")}
        placementSummaryByAssetId={placementSummaryByAssetId}
        riskPlacementIdSet={riskPlacementIdSet}
        scenePackage={scenePackage}
      />
    </div>
  );
}

function AssetPoolGroup({
  assets,
  assetNameById,
  isCollapsed,
  label,
  missingEmptyScene,
  onAddAsset,
  onDeleteChapterAsset,
  onDuplicateChapterAsset,
  onLocatePlacement,
  onToggleCollapsed,
  placementSummaryByAssetId,
  riskPlacementIdSet,
  scenePackage,
}: {
  assets: ChapterAsset[];
  assetNameById: Map<string, string>;
  isCollapsed: boolean;
  label: string;
  missingEmptyScene: boolean;
  onToggleCollapsed: () => void;
  placementSummaryByAssetId: Map<string, AssetPlacementSummary>;
  riskPlacementIdSet: Set<string>;
  scenePackage: ChapterScenePackage;
} & AssetPoolActionHandlers) {
  if (assets.length === 0) {
    return null;
  }

  return (
    <section className="assembly-asset-pool-group" role="group" aria-label={label}>
      <div className="assembly-asset-pool-group-heading">
        <div className="assembly-asset-pool-group-title">
          <h3>{label} <span>({assets.length})</span></h3>
        </div>
        <div className="assembly-asset-pool-group-heading-actions">
          <button
            type="button"
            className="course-planner-icon-button course-planner-compact-icon-action assembly-asset-pool-collapse-button"
            aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${label}`}
            aria-expanded={!isCollapsed}
            title={`${isCollapsed ? "Expand" : "Collapse"} ${label}`}
            onClick={onToggleCollapsed}
          >
            {isCollapsed ? <ChevronRight size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
          </button>
        </div>
      </div>
      {!isCollapsed ? (
        <div className="chapter-studio-card-list assembly-asset-list">
          {assets.map((asset) => {
            const assetName = assetNameById.get(asset.id) ?? readableAssetPoolAssetName(asset);
            const placementSummary = placementSummaryByAssetId.get(asset.id);
            const placementId = placementSummary?.firstPlacementId ?? null;
            return (
              <AssetPoolCard
                key={asset.id}
                asset={asset}
                assetName={assetName}
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
      ) : null}
    </section>
  );
}

function AssetPoolCard({
  asset,
  assetName,
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
  assetName: string;
  hasAlignmentRisk: boolean;
  missingEmptyScene: boolean;
  placementId: string | null;
  scenePackage: ChapterScenePackage;
  usageCount: number;
} & AssetPoolActionHandlers) {
  const dimensionLabel = assetDimensionLabel(asset);
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
      <div className="assembly-asset-card-top">
        <div className="assembly-asset-thumb-frame">
          <img
            className="assembly-asset-thumb"
            alt=""
            src={scenePackageMediaUrl(scenePackage.chapter_id, "chapter_assets", asset.id)}
          />
          <IconActionButton
            className="assembly-asset-card-add"
            label="Add to Assembly"
            disabled={missingEmptyScene}
            draggable={!missingEmptyScene}
            onDragStart={(event) => {
              if (!missingEmptyScene) {
                writeAssemblyAssetDragData(event.dataTransfer, asset.id);
              }
            }}
            onClick={() => void onAddAsset(asset.id)}
            icon={<Plus size={15} aria-hidden="true" />}
          />
        </div>
      </div>
      <div className="assembly-asset-card-middle">
        <div className="assembly-asset-meta">
          <h3 title={assetName}>{assetName}</h3>
          {dimensionLabel ? <p>{dimensionLabel}</p> : null}
        </div>
      </div>
      <div className="assembly-asset-card-bottom">
        <AssetUsageSummary hasAlignmentRisk={hasAlignmentRisk} usageCount={usageCount} />
        <AssemblyAssetCardActions
          asset={asset}
          assetName={assetName}
          onDeleteChapterAsset={onDeleteChapterAsset}
          onDuplicateChapterAsset={onDuplicateChapterAsset}
          onLocatePlacement={onLocatePlacement}
          placementId={placementId}
        />
      </div>
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

function IconActionButton({
  className,
  disabled,
  draggable,
  icon,
  label,
  onClick,
  onDragStart,
}: {
  className?: string;
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
      className={["course-planner-secondary-action", "chapter-studio-icon-action", "assembly-editor-icon-button", className ?? ""].filter(Boolean).join(" ")}
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
