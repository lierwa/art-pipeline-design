import { useRef } from "react";

import type { DraftRegion, SourceMetadata } from "../../domain/workspace";
import { draftEditorStyle } from "./canvasStageGeometry";

type CanvasDraftControlsProps = {
  canCreateChildFromDraft: boolean;
  draftRegion: DraftRegion | null;
  manualElementName: string;
  source: SourceMetadata;
  splitRegions: DraftRegion[];
  onApplySplit: () => void;
  onClearDrafts: () => void;
  onCreateChildElement: (name: string) => void;
  onCreateElement: (name: string) => void;
  onManualElementNameChange: (value: string) => void;
};

export function CanvasDraftControls({
  canCreateChildFromDraft,
  draftRegion,
  manualElementName,
  source,
  splitRegions,
  onApplySplit,
  onClearDrafts,
  onCreateChildElement,
  onCreateElement,
  onManualElementNameChange,
}: CanvasDraftControlsProps) {
  const draftNameInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <>
      {draftRegion ? (
        <div
          className="draft-inline-editor"
          style={draftEditorStyle(draftRegion.bbox, source)}
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <label className="draft-inline-name">
            <span>New element name</span>
            <input
              ref={draftNameInputRef}
              aria-label="New element name"
              type="text"
              defaultValue={manualElementName}
              onChange={(event) => onManualElementNameChange(event.target.value)}
            />
          </label>
          <button
            type="button"
            aria-label="Create element"
            onClick={() => onCreateElement(draftNameInputRef.current?.value ?? manualElementName)}
          >
            Create
          </button>
          <button
            type="button"
            aria-label="Create child"
            disabled={!canCreateChildFromDraft}
            onClick={() => onCreateChildElement(draftNameInputRef.current?.value ?? manualElementName)}
          >
            Child
          </button>
        </div>
      ) : null}
      {splitRegions.length > 0 ? (
        <div
          aria-label="Split draft controls"
          className="split-inline-controls"
          role="group"
          style={draftEditorStyle(splitRegions[splitRegions.length - 1].bbox, source)}
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <span>{splitRegions.length} region{splitRegions.length === 1 ? "" : "s"}</span>
          <button type="button" onClick={onApplySplit}>
            Apply split regions
          </button>
          <button type="button" onClick={onClearDrafts}>
            Cancel split
          </button>
        </div>
      ) : null}
    </>
  );
}
