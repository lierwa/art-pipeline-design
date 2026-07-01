import { useEffect, useMemo, useState } from "react";

import type { PromptVersionUiState } from "../domain/promptVersionUiState";
import type { PromptVersion } from "../types";
import { PromptVersionEditDrawer, type PromptVersionEditDrawerMode } from "./PromptVersionEditDrawer";
import { PromptVersionPreview } from "./PromptVersionPreview";
import {
  draftFromVersion,
  type PromptVersionDraft,
} from "./promptVersionDraft";

type PromptVersionDraftEditorProps = {
  draft: PromptVersionDraft | null;
  isSaving: boolean;
  onDraftChange: (version: PromptVersion, draft: PromptVersionDraft) => void;
  onSave: (version: PromptVersion) => void;
  tuneRequestKey?: number;
  uiState: PromptVersionUiState;
  version: PromptVersion | null;
};

export function PromptVersionDraftEditor({
  draft,
  isSaving,
  onDraftChange,
  onSave,
  tuneRequestKey = 0,
  uiState,
  version,
}: PromptVersionDraftEditorProps) {
  const [drawerMode, setDrawerMode] = useState<PromptVersionEditDrawerMode | null>(null);
  const [draftSnapshot, setDraftSnapshot] = useState<PromptVersionDraft | null>(null);
  const currentDraft = useMemo(() => (version ? draft ?? draftFromVersion(version) : null), [draft, version]);

  useEffect(() => {
    // WHY: drawer 的编辑目标以当前 selected PromptVersion 为权威；切版本时必须收起旧 drawer，避免草稿串线。
    setDrawerMode(null);
    setDraftSnapshot(null);
  }, [version?.id]);

  useEffect(() => {
    if (!tuneRequestKey || !version || !currentDraft) {
      return;
    }
    // WHY: 右侧 Prompt Preview 发现缺角色 IP 时，入口也必须打开同一个 Tune drawer；
    // drawer 状态仍集中在这里，避免 02 出现两套编辑状态源。
    setDraftSnapshot(currentDraft);
    setDrawerMode("tune");
  }, [currentDraft, tuneRequestKey, version]);

  function openDrawer(mode: PromptVersionEditDrawerMode) {
    if (!version || !currentDraft) {
      return;
    }
    setDraftSnapshot(currentDraft);
    setDrawerMode(mode);
  }

  function handleDraftChange(nextDraft: PromptVersionDraft) {
    if (!version) {
      return;
    }
    onDraftChange(version, nextDraft);
  }

  function handleDiscardDraft() {
    if (version && draftSnapshot) {
      onDraftChange(version, draftSnapshot);
    }
  }

  return (
    <>
      <PromptVersionPreview
        version={version}
        uiState={uiState}
        onTunePrompt={() => openDrawer("tune")}
        onEditDesign={() => openDrawer("design")}
      />
      <PromptVersionEditDrawer
        mode={drawerMode ?? "design"}
        version={version}
        isOpen={Boolean(version && drawerMode)}
        isSaving={isSaving}
        draft={currentDraft}
        draftSnapshot={draftSnapshot}
        onDraftChange={handleDraftChange}
        onDiscardDraft={handleDiscardDraft}
        onClose={() => {
          setDrawerMode(null);
          setDraftSnapshot(null);
        }}
        onSave={() => {
          if (version) {
            onSave(version);
          }
        }}
      />
    </>
  );
}

export { draftEquals, draftFromVersion, promptVersionPatchFromDraft } from "./promptVersionDraft";
export type { PromptVersionDraft } from "./promptVersionDraft";
