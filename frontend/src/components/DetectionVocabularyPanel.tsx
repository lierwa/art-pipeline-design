import { FormEvent, useMemo, useState } from "react";
import { X } from "lucide-react";

type DetectionVocabularyPanelProps = {
  labels: string[];
  disabled: boolean;
  onSave: (labels: string[]) => void;
};

export function DetectionVocabularyPanel({
  labels,
  disabled,
  onSave,
}: DetectionVocabularyPanelProps) {
  const [draftLabel, setDraftLabel] = useState("");
  // WHY: 这些 chips 是 Grounding DINO prompt 的唯一来源，保存前先收敛空值与重复词，避免前后端各自解释检测词表。
  const normalizedLabels = useMemo(() => normalizeVocabulary(labels), [labels]);
  const canAddLabel = draftLabel.trim().length > 0 && !disabled;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAddLabel) {
      return;
    }

    const nextLabels = normalizeVocabulary([...normalizedLabels, draftLabel]);
    if (nextLabels.length === normalizedLabels.length) {
      setDraftLabel("");
      return;
    }

    onSave(nextLabels);
    setDraftLabel("");
  }

  function handleRemoveLabel(labelToRemove: string) {
    if (disabled) {
      return;
    }

    onSave(normalizedLabels.filter((label) => label !== labelToRemove));
  }

  return (
    <section className="panel detection-vocabulary-panel" aria-label="Detection vocabulary">
      <div className="panel-header">
        <div>
          <h2>Detection vocabulary</h2>
          <span className="panel-header-kicker">{normalizedLabels.length} labels</span>
        </div>
      </div>
      <div className="panel-body detection-vocabulary-body">
        <div className="detection-vocabulary-chips" aria-label="Detection labels">
          {normalizedLabels.map((label) => (
            <span key={label} className="detection-vocabulary-chip">
              <span>{label}</span>
              <button
                type="button"
                aria-label={`Remove ${label}`}
                disabled={disabled}
                onClick={() => handleRemoveLabel(label)}
              >
                <X aria-hidden="true" size={12} strokeWidth={2.4} />
              </button>
            </span>
          ))}
        </div>
        <form className="detection-vocabulary-form" onSubmit={handleSubmit}>
          <label>
            <span>Detection label</span>
            <input
              aria-label="Detection label"
              type="text"
              value={draftLabel}
              disabled={disabled}
              onChange={(event) => setDraftLabel(event.target.value)}
            />
          </label>
          <button type="submit" disabled={!canAddLabel} aria-label="Add label">
            Add
          </button>
        </form>
      </div>
    </section>
  );
}

function normalizeVocabulary(labels: string[]): string[] {
  const seenLabels = new Set<string>();
  const normalizedLabels: string[] = [];

  for (const label of labels) {
    const normalizedLabel = label.trim().toLowerCase();
    if (!normalizedLabel || seenLabels.has(normalizedLabel)) {
      continue;
    }
    seenLabels.add(normalizedLabel);
    normalizedLabels.push(normalizedLabel);
  }

  return normalizedLabels;
}
