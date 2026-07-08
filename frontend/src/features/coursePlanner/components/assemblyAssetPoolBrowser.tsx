import { type ReactNode } from "react";
import { Search } from "lucide-react";

import type { ChapterScenePackage } from "../types";
import {
  buildReadableAssetPoolAssetNames,
  readableAssetPoolAssetName,
} from "./assemblyDisplayNames";

export {
  buildReadableAssetPoolAssetNames,
  readableAssetPoolAssetName,
} from "./assemblyDisplayNames";

type ChapterAsset = ChapterScenePackage["chapter_assets"][number];

type AssetPoolBrowserControlsProps = {
  assetQuery: string;
  onQueryChange: (query: string) => void;
  trailingControls?: ReactNode;
};

export function AssetPoolBrowserControls({
  assetQuery,
  onQueryChange,
  trailingControls,
}: AssetPoolBrowserControlsProps) {
  return (
    <div className="assembly-asset-browser">
      <div className="assembly-asset-browser-toolbar">
        <label className="assembly-asset-search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            aria-label="Search assets"
            placeholder="Search"
            value={assetQuery}
            onChange={(event) => onQueryChange(event.currentTarget.value)}
          />
        </label>
        {trailingControls ? <div className="assembly-asset-browser-trailing">{trailingControls}</div> : null}
      </div>
    </div>
  );
}

export function filterAssetPool(
  assets: ChapterAsset[],
  assetQuery: string,
) {
  const normalizedQuery = assetQuery.trim().toLowerCase();
  // WHY: 资源很多时不能把全部 metadata 摊开；这里用 asset 自身事实做搜索/筛选，
  // 保持资源池是浏览入口，不引入另一套 Chapter Asset 分类或 target-linkage 事实源。
  return assets.filter((asset) => {
    if (!normalizedQuery) {
      return true;
    }
    const searchableText = [
      readableAssetPoolAssetName(asset),
      asset.original_filename,
    ].join(" ").toLowerCase();
    return searchableText.includes(normalizedQuery);
  });
}

export function assetDimensionLabel(asset: ChapterAsset): string | null {
  const width = Number(asset.width);
  const height = Number(asset.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  return `${Math.round(width)} x ${Math.round(height)}`;
}
