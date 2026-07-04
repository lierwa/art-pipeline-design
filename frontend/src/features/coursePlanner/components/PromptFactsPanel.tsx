import { useEffect, useMemo, useState } from "react";

import type { ChapterScenePromptInput } from "../api";
import type {
  CharacterIpProfile,
  ChapterScenePackage,
  ReferenceLibraryImage,
} from "../types";
import { CoursePlannerStatusBadge } from "./CoursePlannerChrome";

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
  const characterReferenceNames = useMemo(
    () => scenePackage.cast_assignments.flatMap((assignment) =>
      assignment.reference_image_ids.map((referenceId) => referenceLabel(referenceImages, referenceId)),
    ),
    [referenceImages, scenePackage.cast_assignments],
  );
  const styleReferenceNames = useMemo(
    () => styleSelections.map((selection) => referenceLabel(referenceImages, selection.reference_image_id)),
    [referenceImages, styleSelections],
  );

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
          <p>{scenePackage.prompt.updated_at ? `Updated ${scenePackage.prompt.updated_at}` : "Draft"}</p>
        </div>
        <CoursePlannerStatusBadge tone={avoidReviewed ? "success" : "warning"}>
          {avoidReviewed ? "Reviewed" : "Pending"}
        </CoursePlannerStatusBadge>
      </div>

      <div className="chapter-studio-form-grid">
        <label className="course-planner-field">
          <span>Prompt text</span>
          <textarea value={promptText} onChange={(event) => setPromptText(event.target.value)} />
        </label>
        <label className="course-planner-field">
          <span>Spatial contract</span>
          <textarea value={spatialContract} onChange={(event) => setSpatialContract(event.target.value)} />
        </label>
      </div>

      <div className="chapter-studio-facts-grid">
        <FactBlock title="Character IP" items={characterNames} emptyText="Pending" />
        <FactBlock title="Cast action" items={scenePackage.cast_assignments.map((assignment) => assignment.action_intent)} emptyText="Pending" />
        <FactBlock title="Character references" items={characterReferenceNames} emptyText="Pending" />
        <FactBlock title="Target objects" items={scenePackage.target_objects.map((item) => item.label)} emptyText="None" />
        <FactBlock title="Avoid objects" items={scenePackage.avoid_objects.map((item) => item.label)} emptyText="None" />
        <FactBlock title="Style references" items={styleReferenceNames} emptyText="Confirmed empty" />
      </div>

      <div className="chapter-studio-form-grid chapter-studio-form-grid-compact">
        <label className="course-planner-field chapter-studio-checkbox">
          <span>Avoid reviewed</span>
          <input type="checkbox" checked={avoidReviewed} onChange={(event) => setAvoidReviewed(event.target.checked)} />
        </label>
        <label className="course-planner-field">
          <span>Style mode</span>
          <select value={styleReferenceMode} onChange={(event) => setStyleReferenceMode(event.target.value as typeof styleReferenceMode)}>
            <option value="unreviewed">Unreviewed</option>
            <option value="selected">Selected</option>
            <option value="confirmed_empty">Confirmed empty</option>
          </select>
        </label>
      </div>

      <div className="chapter-studio-actions">
        <button type="button" className="course-planner-primary-action" disabled={isSaving} onClick={handleSave}>
          Save Prompt Facts
        </button>
      </div>
    </section>
  );
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

function FactBlock({ emptyText, items, title }: { title: string; items: string[]; emptyText: string }) {
  const values = items.filter((item) => item.trim().length > 0);

  return (
    <section className="chapter-studio-fact-block">
      <h3>{title}</h3>
      {values.length ? (
        <div className="course-planner-chip-list">
          {values.map((item) => (
            <span key={item} className="course-planner-chip">
              {item}
            </span>
          ))}
        </div>
      ) : (
        <p>{emptyText}</p>
      )}
    </section>
  );
}
