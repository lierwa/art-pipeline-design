import { Minimize2, SlidersHorizontal } from "lucide-react";

import { DetectionVocabularyPanel } from "./DetectionVocabularyPanel";

type DetectionPromptBoardDockProps = {
  labels: string[];
  disabled: boolean;
  isExpanded: boolean;
  onExpandedChange: (isExpanded: boolean) => void;
  onSave: (labels: string[]) => void;
};

export function DetectionPromptBoardDock({
  labels,
  disabled,
  isExpanded,
  onExpandedChange,
  onSave,
}: DetectionPromptBoardDockProps) {
  return (
    <div className={`canvas-prompt-board-dock${isExpanded ? "" : " is-collapsed"}`}>
      {isExpanded ? (
        <div className="detection-prompt-board-shell">
          <DetectionVocabularyPanel
            className="detection-prompt-board"
            labels={labels}
            disabled={disabled}
            onSave={onSave}
          />
          <button
            type="button"
            className="canvas-prompt-board-collapse"
            aria-label="Collapse detection prompt"
            title="Collapse detection prompt"
            onClick={() => onExpandedChange(false)}
          >
            <Minimize2 size={15} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="canvas-prompt-board-toggle"
          aria-label="Edit detection prompt"
          title="Edit detection prompt"
          onClick={() => onExpandedChange(true)}
        >
          <SlidersHorizontal size={15} strokeWidth={2.2} aria-hidden="true" />
          <span>Prompt</span>
        </button>
      )}
    </div>
  );
}
