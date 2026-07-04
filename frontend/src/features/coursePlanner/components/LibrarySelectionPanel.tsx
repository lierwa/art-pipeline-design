import { type ChangeEvent, useMemo, useRef, useState } from "react";
import { ImagePlus, Link2 } from "lucide-react";

import type {
  ChapterCastAssignmentInput,
  ChapterReferenceSelectionInput,
  ReferenceLibraryImageUploadInput,
} from "../api";
import type {
  CharacterIpProfile,
  ChapterScenePackage,
  ReferenceLibraryImage,
} from "../types";
import { CoursePlannerStatusBadge } from "./CoursePlannerChrome";

type LibrarySelectionPanelProps = {
  characterIps: CharacterIpProfile[];
  referenceImages: ReferenceLibraryImage[];
  scenePackage: ChapterScenePackage;
  onAssignCharacterIp: (input: ChapterCastAssignmentInput) => Promise<ChapterScenePackage | null>;
  onSelectReferenceImage: (input: ChapterReferenceSelectionInput) => Promise<ChapterScenePackage | null>;
  onUploadReferenceImage: (file: File, input: ReferenceLibraryImageUploadInput) => Promise<ReferenceLibraryImage | null>;
};

type PromptRole = ChapterReferenceSelectionInput["promptRole"];

export function LibrarySelectionPanel({
  characterIps,
  referenceImages,
  scenePackage,
  onAssignCharacterIp,
  onSelectReferenceImage,
  onUploadReferenceImage,
}: LibrarySelectionPanelProps) {
  const availableCharacterIps = useMemo(
    () => characterIps.filter((item) => item.status === "available"),
    [characterIps],
  );
  const availableReferences = useMemo(
    () => referenceImages.filter((item) => item.status === "available"),
    [referenceImages],
  );
  const hasCharacterIp = scenePackage.cast_assignments.length > 0;
  const hasStyleResolution = scenePackage.reference_selections.some((selection) => selection.prompt_role === "style") ||
    scenePackage.prompt_confirmations.style_reference_mode === "confirmed_empty";
  const hasAvoidReview = scenePackage.prompt_confirmations.avoid_objects_reviewed;

  return (
    <section className="chapter-studio-panel chapter-studio-panel-stack" aria-label="Library selection">
      <div className="chapter-studio-panel-heading">
        <div>
          <h2>Library Selection</h2>
          <p>{availableCharacterIps.length} characters / {availableReferences.length} references</p>
        </div>
      </div>

      <div className="chapter-studio-readiness-list">
        <ReadinessRow label="Character IP" ready={hasCharacterIp} detail={`${scenePackage.cast_assignments.length} linked`} />
        <ReadinessRow
          label="Reference Library"
          ready={hasStyleResolution}
          detail={scenePackage.prompt_confirmations.style_reference_mode === "confirmed_empty"
            ? "Confirmed empty"
            : `${scenePackage.reference_selections.length} selected`}
        />
        <ReadinessRow label="Avoid reviewed" ready={hasAvoidReview} detail={`${scenePackage.avoid_objects.length} avoid objects`} />
      </div>

      <CharacterBindingPanel
        availableCharacterIps={availableCharacterIps}
        onAssignCharacterIp={onAssignCharacterIp}
        scenePackage={scenePackage}
      />
      <ReferenceImagesPanel
        availableReferences={availableReferences}
        onSelectReferenceImage={onSelectReferenceImage}
        onUploadReferenceImage={onUploadReferenceImage}
      />
    </section>
  );
}

function CharacterBindingPanel({
  availableCharacterIps,
  onAssignCharacterIp,
  scenePackage,
}: {
  availableCharacterIps: CharacterIpProfile[];
  onAssignCharacterIp: (input: ChapterCastAssignmentInput) => Promise<ChapterScenePackage | null>;
  scenePackage: ChapterScenePackage;
}) {
  const [selectedCharacterId, setSelectedCharacterId] = useState(availableCharacterIps[0]?.id ?? "");
  const [roleLabel, setRoleLabel] = useState("main");
  const [actionIntent, setActionIntent] = useState(scenePackage.cast_assignments[0]?.action_intent ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const selectedCharacter = availableCharacterIps.find((item) => item.id === selectedCharacterId) ?? availableCharacterIps[0] ?? null;

  async function handleAssignCharacterIp() {
    if (!selectedCharacter || !roleLabel.trim() || !actionIntent.trim()) {
      return;
    }
    setIsSaving(true);
    try {
      await onAssignCharacterIp({
        characterIpId: selectedCharacter.id,
        roleLabel: roleLabel.trim(),
        actionIntent: actionIntent.trim(),
        referenceImageIds: selectedCharacter.reference_image_ids,
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="chapter-studio-subpanel">
      <h3>Character IP</h3>
      <label className="course-planner-field">
        <span>Character</span>
        <select value={selectedCharacter?.id ?? ""} onChange={(event) => setSelectedCharacterId(event.target.value)}>
          {availableCharacterIps.length > 0 ? null : <option value="">No characters</option>}
          {availableCharacterIps.map((characterIp) => (
            <option key={characterIp.id} value={characterIp.id}>
              {characterIp.display_name}
            </option>
          ))}
        </select>
      </label>
      <div className="chapter-studio-form-grid chapter-studio-form-grid-compact">
        <label className="course-planner-field">
          <span>Role</span>
          <input value={roleLabel} onChange={(event) => setRoleLabel(event.target.value)} />
        </label>
        <label className="course-planner-field">
          <span>Action</span>
          <input value={actionIntent} onChange={(event) => setActionIntent(event.target.value)} />
        </label>
      </div>
      <button
        type="button"
        className="course-planner-secondary-action chapter-studio-icon-action"
        disabled={isSaving || !selectedCharacter || !roleLabel.trim() || !actionIntent.trim()}
        onClick={() => void handleAssignCharacterIp()}
      >
        <Link2 size={16} aria-hidden="true" />
        Bind Character IP
      </button>
    </div>
  );
}

function ReferenceImagesPanel({
  availableReferences,
  onSelectReferenceImage,
  onUploadReferenceImage,
}: {
  availableReferences: ReferenceLibraryImage[];
  onSelectReferenceImage: (input: ChapterReferenceSelectionInput) => Promise<ChapterScenePackage | null>;
  onUploadReferenceImage: (file: File, input: ReferenceLibraryImageUploadInput) => Promise<ReferenceLibraryImage | null>;
}) {
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [referencePromptRole, setReferencePromptRole] = useState<PromptRole>("style");
  const [referenceTags, setReferenceTags] = useState("");
  const [referenceNotes, setReferenceNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleUploadReference(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setIsSaving(true);
    try {
      const referenceImage = await onUploadReferenceImage(file, {
        tags: tagList(referenceTags),
        notes: referenceNotes.trim(),
      });
      if (referenceImage) {
        await onSelectReferenceImage({
          referenceImageId: referenceImage.id,
          promptRole: referencePromptRole,
        });
        setReferenceTags("");
        setReferenceNotes("");
      }
    } finally {
      event.target.value = "";
      setIsSaving(false);
    }
  }

  return (
    <div className="chapter-studio-subpanel">
      <h3>Reference Images</h3>
      <div className="chapter-studio-form-grid chapter-studio-form-grid-compact">
        <label className="course-planner-field">
          <span>Prompt role</span>
          <select value={referencePromptRole} onChange={(event) => setReferencePromptRole(event.target.value as PromptRole)}>
            <option value="style">Style</option>
            <option value="scene">Scene</option>
            <option value="character">Character</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="course-planner-field">
          <span>Tags</span>
          <input value={referenceTags} onChange={(event) => setReferenceTags(event.target.value)} />
        </label>
      </div>
      <label className="course-planner-field">
        <span>Notes</span>
        <input value={referenceNotes} onChange={(event) => setReferenceNotes(event.target.value)} />
      </label>
      <div className="chapter-studio-actions">
        <button
          type="button"
          className="course-planner-primary-action chapter-studio-icon-action"
          disabled={isSaving}
          onClick={() => uploadInputRef.current?.click()}
        >
          <ImagePlus size={16} aria-hidden="true" />
          Upload Reference
        </button>
        <input ref={uploadInputRef} hidden type="file" accept="image/png" onChange={handleUploadReference} />
      </div>
      <div className="chapter-studio-card-list">
        {availableReferences.map((referenceImage) => (
          <article key={referenceImage.id} className="chapter-studio-mini-card">
            <div>
              <h4>{referenceImage.original_filename}</h4>
              <p>{referenceLabel(referenceImage)}</p>
            </div>
            <button
              type="button"
              className="course-planner-secondary-action chapter-studio-icon-action"
              disabled={isSaving}
              onClick={() => void onSelectReferenceImage({
                referenceImageId: referenceImage.id,
                promptRole: referencePromptRole,
              })}
            >
              <Link2 size={16} aria-hidden="true" />
              Select
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

function ReadinessRow({ detail, label, ready }: { label: string; ready: boolean; detail: string }) {
  return (
    <div className="chapter-studio-readiness-row">
      <div>
        <h3>{label}</h3>
        <p>{detail}</p>
      </div>
      <CoursePlannerStatusBadge tone={ready ? "success" : "warning"}>{ready ? "Ready" : "Pending"}</CoursePlannerStatusBadge>
    </div>
  );
}

function tagList(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function referenceLabel(referenceImage: ReferenceLibraryImage): string {
  return referenceImage.tags.length > 0
    ? referenceImage.tags.join(", ")
    : referenceImage.notes || referenceImage.original_filename;
}
