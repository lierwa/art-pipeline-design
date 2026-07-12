import { useMemo, useState } from "react";
import { Check, Info, Plus, Search } from "lucide-react";

import { scenePackageMediaUrl } from "../scenePackageMedia";
import type { ChapterScenePackage, GeneratedChapterAsset } from "../types";
import { CoursePlannerDrawer, CoursePlannerStatusBadge } from "./CoursePlannerChrome";
import {
  buildGeneratedChapterAssetGroups,
  generatedChapterAssetDimensions,
  generatedChapterAssetKey,
  isGeneratedChapterAssetImportable,
  type GeneratedChapterAssetGroupMode,
} from "./generatedChapterAssetsModel";

type GeneratedChapterAssetsDrawerProps = {
  assets: GeneratedChapterAsset[];
  errorMessage?: string | null;
  isLoading?: boolean;
  isOpen: boolean;
  onClose: () => void;
  onMaterializeAsset: (asset: GeneratedChapterAsset) => Promise<void> | void;
  scenePackage: ChapterScenePackage;
};

export function GeneratedChapterAssetsDrawer({
  assets,
  errorMessage,
  isLoading = false,
  isOpen,
  onClose,
  onMaterializeAsset,
  scenePackage,
}: GeneratedChapterAssetsDrawerProps) {
  const [groupMode, setGroupMode] = useState<GeneratedChapterAssetGroupMode>("completeImage");
  const [query, setQuery] = useState("");
  const [pendingAssetKey, setPendingAssetKey] = useState<string | null>(null);
  const groups = useMemo(
    () => buildGeneratedChapterAssetGroups({ assets, groupMode, query, scenePackage }),
    [assets, groupMode, query, scenePackage],
  );

  async function handleAdd(asset: GeneratedChapterAsset) {
    const key = generatedChapterAssetKey(asset);
    setPendingAssetKey(key);
    try {
      await onMaterializeAsset(asset);
    } finally {
      setPendingAssetKey((current) => (current === key ? null : current));
    }
  }

  return (
    <CoursePlannerDrawer
      footer={(
        <>
          <p className="generated-assets-footer-note">
            <Info size={14} aria-hidden="true" />
            <span>Added assets save to this chapter.</span>
          </p>
          <button type="button" className="course-planner-secondary-action" onClick={onClose}>Close</button>
        </>
      )}
      isOpen={isOpen}
      modal={false}
      onClose={onClose}
      title="Generated Chapter Assets"
    >
      <div className="generated-assets-drawer-content">
        <div className="generated-assets-tabs" role="group" aria-label="Generated asset grouping">
          <button
            type="button"
            className={groupMode === "completeImage" ? "is-active" : ""}
            aria-pressed={groupMode === "completeImage"}
            onClick={() => setGroupMode("completeImage")}
          >
            By Complete Image
          </button>
          <button
            type="button"
            className={groupMode === "run" ? "is-active" : ""}
            aria-pressed={groupMode === "run"}
            onClick={() => setGroupMode("run")}
          >
            By Run
          </button>
        </div>

        <label className="generated-assets-search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            aria-label="Search generated assets"
            placeholder="Search assets"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>

        {isLoading ? <p className="course-planner-status">Loading generated assets.</p> : null}
        {errorMessage ? <p className="course-planner-error">{errorMessage}</p> : null}
        {!isLoading && !errorMessage && groups.length === 0 ? (
          <p className="course-planner-empty">No generated assets match this chapter.</p>
        ) : null}

        {groups.map((group) => (
          <section key={group.id} className="generated-assets-group" aria-label={group.title}>
            <div className="generated-assets-group-heading">
              <div>
                <h3>{group.title}</h3>
                <p>{group.subtitle}</p>
              </div>
            </div>
            <div className="generated-assets-row-list">
              {group.assets.map((asset) => (
                <GeneratedAssetRow
                  key={generatedChapterAssetKey(asset)}
                  asset={asset}
                  isPending={pendingAssetKey === generatedChapterAssetKey(asset)}
                  onAdd={() => void handleAdd(asset)}
                  scenePackage={scenePackage}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </CoursePlannerDrawer>
  );
}

function GeneratedAssetRow({
  asset,
  isPending,
  onAdd,
  scenePackage,
}: {
  asset: GeneratedChapterAsset;
  isPending: boolean;
  onAdd: () => void;
  scenePackage: ChapterScenePackage;
}) {
  const isAdded = asset.state === "added";
  const importable = isGeneratedChapterAssetImportable(asset);
  const buttonLabel = isAdded ? `Added ${asset.display_name}` : `Add ${asset.display_name}`;

  return (
    <article className={`generated-asset-row generated-asset-row-${asset.state}`}>
      <GeneratedAssetThumb asset={asset} scenePackage={scenePackage} />
      <div className="generated-asset-row-main">
        <div className="generated-asset-row-title">
          <h4>{asset.display_name}</h4>
          <CoursePlannerStatusBadge tone={statusTone(asset.state)}>{statusLabel(asset.state)}</CoursePlannerStatusBadge>
        </div>
        <p>{generatedChapterAssetDimensions(asset)}</p>
        {asset.unavailable_reason ? <p className="generated-asset-unavailable-reason">{asset.unavailable_reason}</p> : null}
      </div>
      <button
        type="button"
        className={isAdded ? "course-planner-secondary-action" : "course-planner-primary-action"}
        aria-label={buttonLabel}
        disabled={isAdded || !importable || isPending}
        onClick={onAdd}
      >
        {isAdded ? <Check size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}
        <span>{isAdded ? "Added" : "Add"}</span>
      </button>
    </article>
  );
}

function GeneratedAssetThumb({
  asset,
  scenePackage,
}: {
  asset: GeneratedChapterAsset;
  scenePackage: ChapterScenePackage;
}) {
  if (asset.chapter_asset_id) {
    return (
      <img
        className="generated-asset-thumb"
        alt=""
        src={scenePackageMediaUrl(scenePackage.chapter_id, "chapter_assets", asset.chapter_asset_id)}
      />
    );
  }
  return (
    <div className="generated-asset-thumb generated-asset-thumb-placeholder" aria-hidden="true">
      {asset.display_name.slice(0, 1).toUpperCase()}
    </div>
  );
}

function statusLabel(state: GeneratedChapterAsset["state"]) {
  if (state === "added") {
    return "Added";
  }
  if (state === "unavailable") {
    return "Unavailable";
  }
  return "Ready";
}

function statusTone(state: GeneratedChapterAsset["state"]) {
  if (state === "added") {
    return "success" as const;
  }
  if (state === "unavailable") {
    return "danger" as const;
  }
  return "success" as const;
}
