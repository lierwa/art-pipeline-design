import { useEffect, useMemo, useState } from "react";

import type { ChapterScenePromptInput } from "../api";
import type {
  CharacterIpProfile,
  ChapterScenePackage,
  ReferenceLibraryImage,
} from "../types";

type PromptFactsPanelProps = {
  characterIps: CharacterIpProfile[];
  referenceImages: ReferenceLibraryImage[];
  scenePackage: ChapterScenePackage;
  onUpdatePrompt: (input: ChapterScenePromptInput) => Promise<ChapterScenePackage | null>;
};

export function PromptFactsPanel({
  characterIps,
  referenceImages,
  scenePackage,
  onUpdatePrompt,
}: PromptFactsPanelProps) {
  const [promptText, setPromptText] = useState(scenePackage.prompt.prompt_text);
  const [spatialContract, setSpatialContract] = useState(scenePackage.prompt.scene_spatial_contract);
  const [avoidReviewed, setAvoidReviewed] = useState(scenePackage.prompt_confirmations.avoid_objects_reviewed);
  const [styleReferenceMode, setStyleReferenceMode] = useState(scenePackage.prompt_confirmations.style_reference_mode);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setPromptText(scenePackage.prompt.prompt_text);
    setSpatialContract(scenePackage.prompt.scene_spatial_contract);
    setAvoidReviewed(scenePackage.prompt_confirmations.avoid_objects_reviewed);
    setStyleReferenceMode(scenePackage.prompt_confirmations.style_reference_mode);
  }, [scenePackage]);

  const styleSelections = useMemo(
    () => scenePackage.reference_selections.filter((selection) => selection.prompt_role === "style"),
    [scenePackage.reference_selections],
  );
  const characterNames = useMemo(
    () => scenePackage.cast_assignments.map((assignment) => characterLabel(characterIps, assignment.character_ip_id)),
    [characterIps, scenePackage.cast_assignments],
  );
  const styleReferenceNames = useMemo(
    () => styleSelections.map((selection) => referenceLabel(referenceImages, selection.reference_image_id)),
    [referenceImages, styleSelections],
  );
  const styleSummary = styleReferenceNames.length > 0
    ? `${styleReferenceNames.length} selected`
    : styleReferenceMode === "confirmed_empty" ? "Confirmed empty" : "Unreviewed";

  async function handleSave() {
    setIsSaving(true);
    try {
      await onUpdatePrompt({
        promptText,
        sceneSpatialContract: spatialContract,
        promptConfirmations: {
          avoidObjectsReviewed: avoidReviewed,
          styleReferenceMode,
        },
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="chapter-studio-panel chapter-studio-panel-stack" aria-label="Prompt facts">
      <div className="chapter-studio-panel-heading">
        <div>
          <h2>Prompt Facts</h2>
          <p>{promptUpdatedLabel(scenePackage.prompt.updated_at)}</p>
        </div>
      </div>

      <dl className="chapter-prompt-summary-strip">
        <PromptSummaryMetric label="Characters" value={String(characterNames.length)} />
        <PromptSummaryMetric label="Target Objects" value={String(scenePackage.target_objects.length)} />
        <PromptSummaryMetric label="Avoid Objects" value={String(scenePackage.avoid_objects.length)} />
        <PromptSummaryMetric label="Style" value={styleSummary} />
        <PromptSummaryMetric label="Time & Place" value={spatialContract.trim() ? "Defined" : "Missing"} />
      </dl>

      <div className="chapter-studio-actions">
        <button type="button" className="course-planner-primary-action" disabled={isSaving} onClick={handleSave}>
          Save Prompt Facts
        </button>
      </div>
    </section>
  );
}

function PromptSummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function promptUpdatedLabel(updatedAt: string | null) {
  if (!updatedAt) {
    return "Draft";
  }
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) {
    return "Updated";
  }
  // WHY: 原始 ISO 时间戳是数据事实，不适合塞进编辑面板标题；这里只做展示压缩。
  return `Updated ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function characterLabel(characterIps: CharacterIpProfile[], characterIpId: string): string {
  return characterIps.find((item) => item.id === characterIpId)?.display_name ?? characterIpId;
}

function referenceLabel(referenceImages: ReferenceLibraryImage[], referenceImageId: string): string {
  const image = referenceImages.find((item) => item.id === referenceImageId);
  if (!image) {
    return referenceImageId;
  }
  return image.tags.length > 0
    ? `${image.original_filename} (${image.tags.join(", ")})`
    : image.original_filename;
}
