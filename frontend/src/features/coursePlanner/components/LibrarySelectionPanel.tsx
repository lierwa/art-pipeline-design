import { useEffect, useMemo, useState } from "react";

import type { ChapterCastAssignmentInput } from "../api";
import type {
  CharacterIpProfile,
  ChapterScenePackage,
  SceneStyleReference,
} from "../types";
import { CoursePlannerStatusBadge } from "./CoursePlannerChrome";

type LibrarySelectionPanelProps = {
  characterIps: CharacterIpProfile[];
  sceneStyles: SceneStyleReference[];
  scenePackage: ChapterScenePackage;
  onAssignCharacterIp: (input: ChapterCastAssignmentInput) => Promise<ChapterScenePackage | null>;
  onRemoveCharacterIp: (characterIpId: string) => Promise<ChapterScenePackage | null>;
  onSelectSceneStyle: (sceneStyleId: string) => Promise<ChapterScenePackage | null>;
  onClearSceneStyle: () => Promise<ChapterScenePackage | null>;
};

export function LibrarySelectionPanel({
  characterIps,
  sceneStyles,
  scenePackage,
  onAssignCharacterIp,
  onRemoveCharacterIp,
  onSelectSceneStyle,
  onClearSceneStyle,
}: LibrarySelectionPanelProps) {
  const boundIds = useMemo(
    () => new Set(scenePackage.cast_assignments.map((item) => item.character_ip_id)),
    [scenePackage.cast_assignments],
  );
  const availableCharacters = characterIps.filter((item) => !boundIds.has(item.id));
  const [characterId, setCharacterId] = useState(availableCharacters[0]?.id ?? "");
  const [roleLabel, setRoleLabel] = useState("main");
  const [actionIntent, setActionIntent] = useState("");
  const [styleId, setStyleId] = useState(scenePackage.scene_style_reference_id ?? "");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!availableCharacters.some((item) => item.id === characterId)) {
      setCharacterId(availableCharacters[0]?.id ?? "");
    }
  }, [availableCharacters, characterId]);

  useEffect(() => {
    setStyleId(scenePackage.scene_style_reference_id ?? "");
  }, [scenePackage.scene_style_reference_id]);

  async function bindCharacter() {
    if (!characterId || !roleLabel.trim() || !actionIntent.trim()) {
      return;
    }
    setIsSaving(true);
    try {
      await onAssignCharacterIp({
        characterIpId: characterId,
        roleLabel: roleLabel.trim(),
        actionIntent: actionIntent.trim(),
      });
      setActionIntent("");
    } finally {
      setIsSaving(false);
    }
  }

  async function applyStyle() {
    setIsSaving(true);
    try {
      if (styleId) {
        await onSelectSceneStyle(styleId);
      } else {
        await onClearSceneStyle();
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="chapter-studio-panel chapter-studio-panel-stack" aria-label="Library selection">
      <div className="chapter-studio-panel-heading">
        <div>
          <h2>Library Selection</h2>
          <p>Chapter 只选择全局资料，不在这里创建或修改。</p>
        </div>
      </div>

      <div className="chapter-studio-readiness-list">
        <SelectionStatus
          label="Character IP"
          ready={scenePackage.cast_assignments.length > 0}
          detail={`${scenePackage.cast_assignments.length} selected`}
        />
        <SelectionStatus
          label="Scene Style"
          ready={Boolean(scenePackage.scene_style_reference_id)}
          detail={scenePackage.scene_style_reference_id ? "1 selected" : "Not selected"}
        />
      </div>

      <div className="chapter-studio-subpanel">
        <h3>Characters</h3>
        {scenePackage.cast_assignments.map((assignment) => (
          <div className="chapter-studio-mini-card" key={assignment.id}>
            <div>
              <h4>{characterName(characterIps, assignment.character_ip_id)}</h4>
              <p>{assignment.role_label} · {assignment.action_intent}</p>
            </div>
            <button type="button" disabled={isSaving} onClick={() => void onRemoveCharacterIp(assignment.character_ip_id)}>解除</button>
          </div>
        ))}
        {characterIps.length === 0 ? <LibraryEmptyHint /> : (
          <>
            <label className="course-planner-field">
              <span>Character</span>
              <select value={characterId} onChange={(event) => setCharacterId(event.target.value)}>
                {availableCharacters.length === 0 ? <option value="">All characters selected</option> : null}
                {availableCharacters.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}
              </select>
            </label>
            <div className="chapter-studio-form-grid chapter-studio-form-grid-compact">
              <label className="course-planner-field"><span>Role</span><input value={roleLabel} onChange={(event) => setRoleLabel(event.target.value)} /></label>
              <label className="course-planner-field"><span>Action</span><input value={actionIntent} onChange={(event) => setActionIntent(event.target.value)} /></label>
            </div>
            <button type="button" className="course-planner-secondary-action" disabled={isSaving || !characterId || !roleLabel.trim() || !actionIntent.trim()} onClick={() => void bindCharacter()}>
              Bind Character IP
            </button>
          </>
        )}
      </div>

      <div className="chapter-studio-subpanel">
        <h3>Scene Style</h3>
        {sceneStyles.length === 0 ? <LibraryEmptyHint /> : (
          <>
            <label className="course-planner-field">
              <span>Style reference</span>
              <select value={styleId} onChange={(event) => setStyleId(event.target.value)}>
                <option value="">Not selected</option>
                {sceneStyles.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}
              </select>
            </label>
            <button type="button" className="course-planner-secondary-action" disabled={isSaving || styleId === (scenePackage.scene_style_reference_id ?? "")} onClick={() => void applyStyle()}>
              Apply Scene Style
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function SelectionStatus({ label, ready, detail }: { label: string; ready: boolean; detail: string }) {
  return (
    <div className="chapter-studio-readiness-row">
      <div><h3>{label}</h3><p>{detail}</p></div>
      <CoursePlannerStatusBadge tone={ready ? "success" : "warning"}>{ready ? "Ready" : "Pending"}</CoursePlannerStatusBadge>
    </div>
  );
}

function LibraryEmptyHint() {
  return <p>请返回 Scene 页面，在资料库中先创建对应资料。</p>;
}

function characterName(characterIps: CharacterIpProfile[], id: string): string {
  return characterIps.find((item) => item.id === id)?.display_name ?? id;
}
