import { cloneElement, isValidElement, useEffect, useMemo, useState, type ReactNode } from "react";
import { X } from "lucide-react";

import { ConfirmActionDialog } from "../../../shared/ui/ConfirmActionDialog";
import type { PromptVersion } from "../types";
import {
  draftEquals,
  promptVersionPatchFromDraft,
  type PromptVersionDraft,
  type PromptTuningText,
  type SceneVocabularyText,
} from "./promptVersionDraft";
import { CoursePlannerDrawer } from "./CoursePlannerChrome";

export type PromptVersionEditDrawerMode = "design" | "tune" | "revise";

export type PromptVersionEditDrawerProps = {
  mode: PromptVersionEditDrawerMode;
  version: PromptVersion | null;
  isOpen: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSave: (patch: Partial<PromptVersion>) => void;
  onSubmitRevision?: (feedback: string) => void;
  draft?: PromptVersionDraft | null;
  draftSnapshot?: PromptVersionDraft | null;
  onDraftChange?: (draft: PromptVersionDraft) => void;
  onDiscardDraft?: () => void;
};

export function PromptVersionEditDrawer({
  mode,
  version,
  isOpen,
  isSaving,
  onClose,
  onSave,
  onSubmitRevision,
  draft = null,
  draftSnapshot = null,
  onDraftChange,
  onDiscardDraft,
}: PromptVersionEditDrawerProps) {
  const [revisionFeedback, setRevisionFeedback] = useState("");

  useEffect(() => {
    if (!isOpen || mode !== "revise") {
      setRevisionFeedback("");
    }
  }, [isOpen, mode, version?.id]);

  const hasDraftChanges = useMemo(() => {
    if (mode === "revise" || !draft || !draftSnapshot) {
      return false;
    }
    return !draftEquals(draft, draftSnapshot);
  }, [draft, draftSnapshot, mode]);
  const hasRevisionChanges = mode === "revise" && revisionFeedback.trim().length > 0;
  const shouldConfirmOnClose = hasDraftChanges || hasRevisionChanges;

  if (!isOpen || !version) {
    return null;
  }

  // WHY: 关闭入口必须只有一条真实路径；否则 footer Cancel 和右上角关闭按钮会各自丢弃不同状态，
  // revise 文本与 design/tune 草稿就会出现“一个要确认、一个直接消失”的分叉。
  function dismissDrawer() {
    if (hasDraftChanges) {
      onDiscardDraft?.();
    }
    setRevisionFeedback("");
    onClose();
  }

  const closeButton = renderDismissAction({
    shouldConfirmOnClose,
    onDismiss: dismissDrawer,
    trigger: (
      <button type="button" className="course-planner-icon-button" aria-label="Close editor">
        <X size={16} aria-hidden="true" />
      </button>
    ),
  });

  return (
    <CoursePlannerDrawer
      ariaLabel="Edit Prompt Version"
      closeButton={closeButton}
      kicker={hasDraftChanges ? "Unsaved edits" : drawerKicker(mode)}
      isOpen={isOpen}
      onClose={onClose}
      title={drawerTitle(mode, version)}
      footer={renderFooter({
        mode,
        isSaving,
        hasDraftChanges,
        hasRevisionChanges,
        closeAction: renderDismissAction({
          shouldConfirmOnClose,
          onDismiss: dismissDrawer,
          trigger: <button type="button">Cancel</button>,
        }),
        onSave: () => {
          if (draft) {
            onSave(promptVersionPatchFromDraft(draft));
          }
        },
        onSubmit: () => {
          const feedback = revisionFeedback.trim();
          if (feedback) {
            onSubmitRevision?.(feedback);
          }
        },
      })}
    >
      <div className="prompt-version-edit-drawer-body">
        {mode === "design" ? (
          <DesignEditor draft={draft} onDraftChange={onDraftChange} />
        ) : null}
        {mode === "tune" ? (
          <TuneEditor draft={draft} onDraftChange={onDraftChange} />
        ) : null}
        {mode === "revise" ? (
          <ReviseEditor feedback={revisionFeedback} onFeedbackChange={setRevisionFeedback} />
        ) : null}
      </div>
    </CoursePlannerDrawer>
  );
}

function DesignEditor({
  draft,
  onDraftChange,
}: {
  draft: PromptVersionDraft | null;
  onDraftChange?: (draft: PromptVersionDraft) => void;
}) {
  if (!draft || !onDraftChange) {
    return null;
  }

  return (
    <>
      <EditorGroup title="Story">
        <EditorTextarea
          label="Story Event"
          value={draft.sceneDirectorPlan.storyEvent}
          onChange={(value) => updateSceneField(draft, onDraftChange, "storyEvent", value)}
        />
      </EditorGroup>
      <EditorGroup title="Composition and space">
        <EditorTextarea
          label="Scene Composition"
          value={draft.sceneDirectorPlan.sceneComposition}
          onChange={(value) => updateSceneField(draft, onDraftChange, "sceneComposition", value)}
        />
        <EditorTextarea
          label="Spatial Structure"
          value={draft.sceneDirectorPlan.spatialStructure}
          onChange={(value) => updateSceneField(draft, onDraftChange, "spatialStructure", value)}
        />
      </EditorGroup>
      <EditorGroup title="Characters and action">
        <EditorTextarea
          label="Character Arrangement"
          value={draft.sceneDirectorPlan.characterArrangement}
          onChange={(value) => updateSceneField(draft, onDraftChange, "characterArrangement", value)}
        />
        <EditorTextarea
          label="Action Design"
          value={draft.sceneDirectorPlan.actionDesign}
          onChange={(value) => updateSceneField(draft, onDraftChange, "actionDesign", value)}
        />
      </EditorGroup>
      <EditorGroup title="Vocabulary and constraints">
        <EditorTextarea
          label="Narrative Anchors"
          value={draft.sceneVocabularyText.narrativeAnchors}
          onChange={(value) => updateVocabularyField(draft, onDraftChange, "narrativeAnchors", value)}
        />
        <EditorTextarea
          label="Vocabulary Candidates"
          value={draft.sceneVocabularyText.optionalVocabularyCandidates}
          onChange={(value) => updateVocabularyField(draft, onDraftChange, "optionalVocabularyCandidates", value)}
        />
        <EditorTextarea
          label="Ambient Scene Detail"
          value={draft.sceneVocabularyText.ambientFurnishingPolicy}
          onChange={(value) => updateVocabularyField(draft, onDraftChange, "ambientFurnishingPolicy", value)}
        />
        <EditorTextarea
          label="Avoid Objects"
          value={draft.sceneVocabularyText.avoidObjects}
          onChange={(value) => updateVocabularyField(draft, onDraftChange, "avoidObjects", value)}
        />
        <EditorTextarea
          label="Style & Constraints"
          value={draft.sceneDirectorPlan.styleAndConstraints}
          onChange={(value) => updateSceneField(draft, onDraftChange, "styleAndConstraints", value)}
        />
      </EditorGroup>
    </>
  );
}

function TuneEditor({
  draft,
  onDraftChange,
}: {
  draft: PromptVersionDraft | null;
  onDraftChange?: (draft: PromptVersionDraft) => void;
}) {
  if (!draft || !onDraftChange) {
    return null;
  }

  return (
    <>
      <EditorGroup title="Role IP bindings">
        <EditorTextarea
          label="Character IP Bindings"
          value={draft.castBindingText}
          onChange={(value) => onDraftChange({ ...draft, castBindingText: value })}
        />
      </EditorGroup>
      <EditorGroup title="Reference images">
        <EditorTextarea
          label="Style Reference Images"
          value={draft.promptTuningText.styleReferenceImageIds}
          onChange={(value) => updateTuningField(draft, onDraftChange, "styleReferenceImageIds", value)}
        />
        <EditorTextarea
          label="Scene Reference Images"
          value={draft.promptTuningText.sceneReferenceImageIds}
          onChange={(value) => updateTuningField(draft, onDraftChange, "sceneReferenceImageIds", value)}
        />
      </EditorGroup>
      <EditorGroup title="Style anchor">
        <EditorTextarea
          label="Style Anchor"
          value={draft.promptTuningText.styleAnchor}
          onChange={(value) => updateTuningField(draft, onDraftChange, "styleAnchor", value)}
        />
      </EditorGroup>
      <EditorGroup title="Prompt constraints">
        <EditorTextarea
          label="Must Keep"
          value={draft.promptTuningText.mustKeep}
          onChange={(value) => updateTuningField(draft, onDraftChange, "mustKeep", value)}
        />
        <EditorTextarea
          label="Avoid"
          value={draft.promptTuningText.avoid}
          onChange={(value) => updateTuningField(draft, onDraftChange, "avoid", value)}
        />
      </EditorGroup>
    </>
  );
}

function ReviseEditor({
  feedback,
  onFeedbackChange,
}: {
  feedback: string;
  onFeedbackChange: (feedback: string) => void;
}) {
  return (
    <label className="prompt-version-edit-field" htmlFor="prompt-version-revision-feedback">
      <span>Revision Feedback</span>
      <textarea
        id="prompt-version-revision-feedback"
        className="prompt-revision-feedback-textarea"
        aria-label="Revision Feedback"
        value={feedback}
        onChange={(event) => onFeedbackChange(event.target.value)}
      />
    </label>
  );
}

function renderFooter({
  mode,
  isSaving,
  hasDraftChanges,
  hasRevisionChanges,
  closeAction,
  onSave,
  onSubmit,
}: {
  mode: PromptVersionEditDrawerMode;
  isSaving: boolean;
  hasDraftChanges: boolean;
  hasRevisionChanges: boolean;
  closeAction: ReactNode;
  onSave: () => void;
  onSubmit: () => void;
}) {
  if (mode === "revise") {
    return (
      <>
        {closeAction}
        <button type="button" disabled={!hasRevisionChanges || isSaving} onClick={onSubmit}>
          {isSaving ? "Submitting..." : "Submit AI revise"}
        </button>
      </>
    );
  }

  return (
    <>
      {closeAction}
      <button type="button" disabled={!hasDraftChanges || isSaving} onClick={onSave}>
        {isSaving ? "保存中..." : "Save changes"}
      </button>
    </>
  );
}

function renderDismissAction({
  shouldConfirmOnClose,
  onDismiss,
  trigger,
}: {
  shouldConfirmOnClose: boolean;
  onDismiss: () => void;
  trigger: ReactNode;
}) {
  if (!shouldConfirmOnClose) {
    return cloneDismissTrigger(trigger, onDismiss);
  }

  return (
    <ConfirmActionDialog
      title="Discard unsaved changes?"
      description="Your edits in this drawer have not been saved."
      confirmLabel="Discard changes"
      cancelLabel="Cancel"
      trigger={trigger}
      onConfirm={onDismiss}
    />
  );
}

function cloneDismissTrigger(trigger: ReactNode, onClick: () => void) {
  if (!isValidElement(trigger)) {
    return trigger;
  }
  return cloneElement(trigger, { onClick });
}

function EditorGroup({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="prompt-version-edit-group">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function EditorTextarea({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className="prompt-version-edit-field">
      <span>{label}</span>
      <textarea aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function updateSceneField(
  draft: PromptVersionDraft,
  onDraftChange: (draft: PromptVersionDraft) => void,
  key: keyof PromptVersionDraft["sceneDirectorPlan"],
  value: string,
) {
  onDraftChange({
    ...draft,
    sceneDirectorPlan: { ...draft.sceneDirectorPlan, [key]: value },
  });
}

function updateVocabularyField(
  draft: PromptVersionDraft,
  onDraftChange: (draft: PromptVersionDraft) => void,
  key: keyof SceneVocabularyText,
  value: string,
) {
  onDraftChange({
    ...draft,
    sceneVocabularyText: { ...draft.sceneVocabularyText, [key]: value },
  });
}

function updateTuningField(
  draft: PromptVersionDraft,
  onDraftChange: (draft: PromptVersionDraft) => void,
  key: keyof PromptTuningText,
  value: string,
) {
  onDraftChange({
    ...draft,
    promptTuningText: { ...draft.promptTuningText, [key]: value },
  });
}

function drawerKicker(mode: PromptVersionEditDrawerMode): string {
  if (mode === "tune") {
    return "Prompt tuning";
  }
  if (mode === "revise") {
    return "AI revision target";
  }
  return "Scene design";
}

function drawerTitle(mode: PromptVersionEditDrawerMode, version: PromptVersion): string {
  if (mode === "tune") {
    return `Tune ${version.versionLabel} / ${version.title}`;
  }
  if (mode === "revise") {
    return `Revise ${version.versionLabel} / ${version.title}`;
  }
  return `Edit ${version.versionLabel} / ${version.title}`;
}
