import type { ObjectPlan, PlannedObject, PromptVersion, SceneDirectorPlan } from "../types";

type ObjectPlanText = {
  coreObjects: string;
  requiredObjects: string;
  recommendedObjects: string;
  avoidOrMoveObjects: string;
};

export type PromptVersionDraft = {
  sceneDirectorPlan: SceneDirectorPlan;
  objectPlanText: ObjectPlanText;
};

type PromptVersionDraftEditorProps = {
  draft: PromptVersionDraft | null;
  isSaving: boolean;
  onDraftChange: (version: PromptVersion, draft: PromptVersionDraft) => void;
  onSave: (version: PromptVersion) => void;
  version: PromptVersion | null;
};

export function PromptVersionDraftEditor({
  draft,
  isSaving,
  onDraftChange,
  onSave,
  version,
}: PromptVersionDraftEditorProps) {
  if (!version) {
    return (
      <section className="chapter-workspace-panel scene-director-design" aria-label="Scene Director Design">
        <p className="course-planner-empty">Select a Prompt Version to inspect the Scene Director plan.</p>
      </section>
    );
  }
  const currentVersion = version;
  const currentDraft = draft ?? draftFromVersion(currentVersion);
  const hasUnsavedEdits = !draftEquals(currentDraft, draftFromVersion(currentVersion));

  function updateSceneField(key: keyof SceneDirectorPlan, value: string) {
    onDraftChange(currentVersion, {
      ...currentDraft,
      sceneDirectorPlan: { ...currentDraft.sceneDirectorPlan, [key]: value },
    });
  }

  function updateObjectPlan(key: keyof ObjectPlanText, value: string) {
    onDraftChange(currentVersion, {
      ...currentDraft,
      objectPlanText: { ...currentDraft.objectPlanText, [key]: value },
    });
  }

  return (
    <section className="chapter-workspace-panel scene-director-design" aria-label="Scene Director Design">
      <div className="chapter-workspace-panel-header">
        <div>
          <h2>Scene Director Design</h2>
          <p>{currentVersion.versionLabel} / {currentVersion.title}</p>
        </div>
        <span>{hasUnsavedEdits ? "未保存编辑" : currentVersion.status}</span>
      </div>
      <div className="chapter-workspace-actions">
        <button type="button" disabled={!hasUnsavedEdits || isSaving} onClick={() => onSave(currentVersion)}>
          {isSaving ? "保存中..." : "Save Draft"}
        </button>
      </div>
      <DirectorSectionList plan={currentDraft.sceneDirectorPlan} onChange={updateSceneField} />
      <ObjectPlanning objectPlanText={currentDraft.objectPlanText} onChange={updateObjectPlan} />
    </section>
  );
}

function DirectorSectionList({
  plan,
  onChange,
}: {
  plan: SceneDirectorPlan;
  onChange: (key: keyof SceneDirectorPlan, value: string) => void;
}) {
  const sections = [
    ["Story Event", "storyEvent"],
    ["Scene Composition", "sceneComposition"],
    ["Spatial Structure", "spatialStructure"],
    ["Character Arrangement", "characterArrangement"],
    ["Action Design", "actionDesign"],
    ["Style / Constraints", "styleAndConstraints"],
  ] as const;
  return (
    <div className="scene-director-section-list">
      {sections.map(([label, key]) => (
        <section key={label} className="scene-director-section">
          <h3>{label}</h3>
          <textarea aria-label={label} value={plan[key]} onChange={(event) => onChange(key, event.target.value)} />
        </section>
      ))}
    </div>
  );
}

function ObjectPlanning({
  objectPlanText,
  onChange,
}: {
  objectPlanText: ObjectPlanText;
  onChange: (key: keyof ObjectPlanText, value: string) => void;
}) {
  const groups = [
    ["Core Objects", "coreObjects"],
    ["Required Objects", "requiredObjects"],
    ["Recommended Objects", "recommendedObjects"],
    ["Avoid / Move Objects", "avoidOrMoveObjects"],
  ] as const;
  return (
    <section className="object-planning-section">
      <h3>Object Planning</h3>
      <div className="object-planning-groups">
        {groups.map(([label, key]) => (
          <div key={label}>
            <h4>{label}</h4>
            <textarea aria-label={label} value={objectPlanText[key]} onChange={(event) => onChange(key, event.target.value)} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function draftFromVersion(version: PromptVersion): PromptVersionDraft {
  // WHY: 当前 API 还没有局部保存合同；本地草稿先保证用户切换前能看到未保存修改，不把临时编辑伪装成已持久化状态。
  return {
    sceneDirectorPlan: { ...version.sceneDirectorPlan },
    objectPlanText: objectPlanToText(version.objectPlan),
  };
}

function objectPlanToText(objectPlan: ObjectPlan): ObjectPlanText {
  return {
    coreObjects: plannedObjectsToText(objectPlan.coreObjects),
    requiredObjects: plannedObjectsToText(objectPlan.requiredObjects),
    recommendedObjects: plannedObjectsToText(objectPlan.recommendedObjects),
    avoidOrMoveObjects: plannedObjectsToText(objectPlan.avoidOrMoveObjects),
  };
}

function plannedObjectsToText(objects: ObjectPlan[keyof ObjectPlan]): string {
  return objects
    .map((object) => [object.name, object.roleInScene, object.placementHint].filter(Boolean).join(" | "))
    .join("\n");
}

export function promptVersionPatchFromDraft(draft: PromptVersionDraft): Pick<PromptVersion, "sceneDirectorPlan" | "objectPlan"> {
  return {
    sceneDirectorPlan: draft.sceneDirectorPlan,
    objectPlan: objectPlanFromText(draft.objectPlanText),
  };
}

function objectPlanFromText(objectPlanText: ObjectPlanText): ObjectPlan {
  return {
    coreObjects: plannedObjectsFromText(objectPlanText.coreObjects, "core"),
    requiredObjects: plannedObjectsFromText(objectPlanText.requiredObjects, "required"),
    recommendedObjects: plannedObjectsFromText(objectPlanText.recommendedObjects, "recommended"),
    avoidOrMoveObjects: plannedObjectsFromText(objectPlanText.avoidOrMoveObjects, "avoid"),
  };
}

function plannedObjectsFromText(text: string, priority: PlannedObject["priority"]): PlannedObject[] {
  return text
    .split(/\r?\n/)
    .map((line) => plannedObjectFromLine(line, priority))
    .filter((object): object is PlannedObject => Boolean(object));
}

function plannedObjectFromLine(line: string, priority: PlannedObject["priority"]): PlannedObject | null {
  const [name = "", roleInScene = "", placementHint = ""] = line
    .split("|")
    .map((part) => part.trim());
  if (!name) {
    return null;
  }
  // WHY: textarea 是轻量编辑协议，不强迫用户填写三列；缺少 role 时用 name
  // 维持后端 min_length 不变量，placement 则保持可选，避免伪造空间信息。
  return {
    name,
    roleInScene: roleInScene || name,
    placementHint: placementHint || null,
    priority,
  };
}

export function draftEquals(left: PromptVersionDraft, right: PromptVersionDraft): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
