import { useState } from "react";
import { Copy, LocateFixed, MoreVertical, Trash2 } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";

import { ConfirmActionDialog } from "../../../shared/ui/ConfirmActionDialog";
import type { ChapterScenePackage } from "../types";
import type { AssetPoolActionHandlers } from "./AssemblyAssetPoolSections";

type ChapterAsset = ChapterScenePackage["chapter_assets"][number];

type AssemblyAssetCardActionsProps = {
  asset: ChapterAsset;
  assetName: string;
  onDuplicateChapterAsset?: AssetPoolActionHandlers["onDuplicateChapterAsset"];
  onDeleteChapterAsset: AssetPoolActionHandlers["onDeleteChapterAsset"];
  onLocatePlacement: AssetPoolActionHandlers["onLocatePlacement"];
  placementId: string | null;
};

export function AssemblyAssetCardActions({
  asset,
  assetName,
  onDeleteChapterAsset,
  onDuplicateChapterAsset,
  onLocatePlacement,
  placementId,
}: AssemblyAssetCardActionsProps) {
  const [isOpen, setIsOpen] = useState(false);

  function closeMenu() {
    setIsOpen(false);
  }

  return (
    <div
      className="assembly-asset-actions"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {/* 使用 Radix Popover 承载折叠动作，避免卡片内自造浮层导致裁剪、层级和焦点状态分叉。 */}
      <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className="assembly-asset-card-more"
            aria-label={`Asset actions for ${assetName}`}
            title="Asset actions"
          >
            <MoreVertical size={17} aria-hidden="true" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end"
            side="top"
            sideOffset={4}
            className="assembly-asset-action-popover"
            role="menu"
          >
            {placementId ? (
              <button
                type="button"
                className="assembly-asset-action-menu-item"
                role="menuitem"
                aria-label="Locate placement"
                onClick={() => {
                  closeMenu();
                  onLocatePlacement(placementId);
                }}
              >
                <LocateFixed size={14} aria-hidden="true" />
                Locate
              </button>
            ) : null}
            {onDuplicateChapterAsset ? (
              <button
                type="button"
                className="assembly-asset-action-menu-item"
                role="menuitem"
                aria-label="Duplicate asset"
                onClick={() => {
                  closeMenu();
                  void onDuplicateChapterAsset(asset.id);
                }}
              >
                <Copy size={14} aria-hidden="true" />
                Duplicate
              </button>
            ) : null}
            <ConfirmActionDialog
              trigger={(
                <button
                  type="button"
                  className="assembly-asset-action-menu-item assembly-asset-action-menu-item-danger"
                  role="menuitem"
                  aria-label="Delete asset"
                >
                  <Trash2 size={14} aria-hidden="true" />
                  Delete
                </button>
              )}
              title={`Delete ${assetName}?`}
              description={placementId
                ? "This removes the Chapter Asset from the current asset pool and clears any placement or dependency references that still point to it. Locked Final snapshots stay intact."
                : "This removes the Chapter Asset from the current asset pool. Locked Final snapshots stay intact."}
              confirmLabel="Confirm delete asset"
              onConfirm={async () => {
                closeMenu();
                await onDeleteChapterAsset(asset.id);
              }}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
