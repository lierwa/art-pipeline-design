import { useMemo, useState } from "react";

import type { AssemblyManifestDraft } from "../assembly/assemblyManifestDraft";
import type { DirectChapterAssetUploadInput } from "../api";
import type { ChapterScenePackage } from "../types";
import {
  AssetPoolBrowserControls,
  filterAssetPool,
} from "./assemblyAssetPoolBrowser";
import {
  AssetPoolList,
  AssetPoolToolbarControls,
  AssetPoolUploadFooter,
  type AssetPlacementSummary,
} from "./AssemblyAssetPoolSections";

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
  const [collapsedGroupLabels, setCollapsedGroupLabels] = useState<ReadonlySet<string>>(() => new Set());
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
    }, new Map<string, AssetPlacementSummary>()),
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

  function handleToggleGroup(label: string) {
    setCollapsedGroupLabels((current) => {
      const next = new Set(current);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }

  return (
    <section className="chapter-studio-panel chapter-studio-panel-stack assembly-asset-pool-panel" aria-label="Assembly asset pool">
      <AssetPoolHeader assetCount={visibleAssets.length} />
      <AssetPoolBrowserControls
        assetQuery={assetQuery}
        onQueryChange={setAssetQuery}
        trailingControls={<AssetPoolToolbarControls onOpenGeneratedAssets={onOpenGeneratedAssets} />}
      />
      <div className="assembly-asset-pool-scroll">
        {missingEmptyScene ? (
          <p className="assembly-asset-pool-help">Select an Empty Scene Image to enable Add to Assembly.</p>
        ) : null}
        <AssetPoolList
          assets={filteredAssets}
          collapsedGroupLabels={collapsedGroupLabels}
          missingEmptyScene={missingEmptyScene}
          onAddAsset={onAddAsset}
          onDeleteChapterAsset={onDeleteChapterAsset}
          onDuplicateChapterAsset={onDuplicateChapterAsset}
          onLocatePlacement={onLocatePlacement}
          onToggleGroup={handleToggleGroup}
          placementSummaryByAssetId={placementSummaryByAssetId}
          riskPlacementIdSet={riskPlacementIdSet}
          scenePackage={scenePackage}
        />
      </div>
      <AssetPoolUploadFooter
        onUploadDirectAsset={onUploadDirectAsset}
        scenePackage={scenePackage}
        targetLabels={targetLabels}
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
