import { ConfirmActionDialog } from "../../../shared/ui/ConfirmActionDialog";
import {
  getPlacementDependencyOptionState,
  removePlacement,
  setPlacementDependencies,
  setPlacementRuntimeRole,
  updatePlacementTransform,
  type AssemblyManifestDraft,
} from "../assembly/assemblyManifestDraft";
import type { ChapterScenePackage, RuntimeRole } from "../types";
import { CoursePlannerStatusBadge } from "./CoursePlannerChrome";

type AssemblyPlacementPropertiesProps = {
  alignmentRiskPlacementIds: string[];
  draft: AssemblyManifestDraft;
  onDraftChange: (draft: AssemblyManifestDraft) => void;
  onSelectionChange: (placementId: string | null, placementIds: string[]) => void;
  scenePackage: ChapterScenePackage;
  selectedPlacementId: string | null;
  selectedPlacementIds: string[];
};

const TRANSFORM_FIELDS = [
  { key: "cx", label: "cx", step: 0.001 },
  { key: "cy", label: "cy", step: 0.001 },
  { key: "w", label: "w", step: 0.001 },
  { key: "h", label: "h", step: 0.001 },
  { key: "rotation_deg", label: "rotation_deg", step: 1 },
] as const;

// WHY: 属性面板只负责编辑 manifest draft 已经定义好的 placement 事实，
// 把 batch role、transform、dependency、remove 都收束到同一边界，避免 layer tree/canvas 各自偷写协议字段。
export function AssemblyPlacementProperties({
  alignmentRiskPlacementIds,
  draft,
  onDraftChange,
  onSelectionChange,
  scenePackage,
  selectedPlacementId,
  selectedPlacementIds,
}: AssemblyPlacementPropertiesProps) {
  const alignmentRiskPlacementIdSet = new Set(alignmentRiskPlacementIds);
  const placementsById = new Map(draft.placements.map((placement) => [placement.id, placement]));
  const selectedPlacements = selectedPlacementIds
    .map((placementId) => placementsById.get(placementId))
    .filter((placement): placement is NonNullable<typeof placement> => Boolean(placement));
  const placement = selectedPlacementId ? placementsById.get(selectedPlacementId) ?? null : null;
  const linkedAsset = placement
    ? scenePackage.chapter_assets.find((item) => item.id === placement.asset_id) ?? null
    : null;
  const selectedRole = resolveSelectedRole(selectedPlacements);
  const selectedPlacementsHaveAlignmentRisk = selectedPlacements.some((item) => alignmentRiskPlacementIdSet.has(item.id));

  function handleRoleChange(role: RuntimeRole) {
    if (selectedPlacements.length === 0) {
      return;
    }
    onDraftChange(setPlacementRuntimeRole(draft, selectedPlacements.map((item) => item.id), role));
  }

  function handleTransformChange(
    key: typeof TRANSFORM_FIELDS[number]["key"],
    value: string,
  ) {
    if (!placement) {
      return;
    }
    const nextValue = Number(value);
    if (!Number.isFinite(nextValue)) {
      return;
    }
    onDraftChange(updatePlacementTransform(draft, placement.id, {
      ...placement.transform,
      [key]: nextValue,
    }));
  }

  function handleDependencyToggle(dependencyPlacementId: string, checked: boolean) {
    if (!placement) {
      return;
    }
    const nextDependencyIds = checked
      ? [...placement.requires_placed, dependencyPlacementId]
      : placement.requires_placed.filter((requiredId) => requiredId !== dependencyPlacementId);
    onDraftChange(setPlacementDependencies(draft, placement.id, nextDependencyIds));
  }

  function handleRemovePlacement() {
    if (!placement) {
      return;
    }
    const nextDraft = removePlacement(draft, placement.id);
    onDraftChange(nextDraft);
    onSelectionChange(null, []);
  }

  return (
    <section className="chapter-studio-panel chapter-studio-panel-stack" aria-label="Placement properties">
      <div className="chapter-studio-panel-heading">
        <div>
          <h2>Placement</h2>
          <p>{selectedPlacements.length > 1 ? `${selectedPlacements.length} placements selected` : placement ? placement.id : "No selection"}</p>
        </div>
        {selectedPlacementsHaveAlignmentRisk ? (
          <CoursePlannerStatusBadge tone="warning">Alignment risk</CoursePlannerStatusBadge>
        ) : null}
      </div>

      {selectedPlacements.length > 0 ? (
        <>
          {selectedPlacementsHaveAlignmentRisk ? (
            <div className="chapter-studio-subpanel assembly-alignment-note">
              <p>Review this preserved placement against the selected Empty Scene before relying on the saved Assembly.</p>
            </div>
          ) : null}
          {placement && selectedPlacements.length === 1 ? (
            <dl className="assembly-property-list">
              <div>
                <dt>Name</dt>
                <dd>{placement.display_name}</dd>
              </div>
              <div>
                <dt>Asset id</dt>
                <dd>{placement.asset_id}</dd>
              </div>
              <div>
                <dt>Linked target</dt>
                <dd>{linkedAsset?.linked_target_object_id ?? "Unlinked"}</dd>
              </div>
            </dl>
          ) : (
            <div className="assembly-editor-empty-state assembly-editor-empty-state-compact">
              <div>
                <strong>{selectedPlacements.length} placements selected</strong>
                <p>Batch edits only apply to runtime role in this panel.</p>
              </div>
            </div>
          )}

          <section className="chapter-studio-subpanel" aria-label="Runtime role">
            <h3>Runtime role</h3>
            <div className="assembly-segmented-control" role="group" aria-label="Runtime role">
              {(["target", "initial"] as const).map((role) => (
                <button
                  key={role}
                  type="button"
                  className={`assembly-segmented-option${selectedRole === role ? " assembly-segmented-option-active" : ""}`}
                  aria-pressed={selectedRole === role}
                  onClick={() => handleRoleChange(role)}
                >
                  {role === "target" ? "Target" : "Initial"}
                </button>
              ))}
            </div>
          </section>

          {placement && selectedPlacements.length === 1 ? (
            <>
              <section className="chapter-studio-subpanel" aria-label="Transform">
                <h3>Transform</h3>
                <div className="assembly-transform-grid">
                  {TRANSFORM_FIELDS.map((field) => (
                    <label key={field.key} className="assembly-field">
                      <span>{field.label}</span>
                      <input
                        type="number"
                        step={field.step}
                        value={placement.transform[field.key]}
                        onChange={(event) => handleTransformChange(field.key, event.target.value)}
                      />
                    </label>
                  ))}
                </div>
              </section>

              <section className="chapter-studio-subpanel" aria-label="Dependencies">
                <h3>Dependencies</h3>
                <div className="assembly-dependency-list">
                  {draft.placements.map((candidatePlacement) => {
                    const optionState = getPlacementDependencyOptionState(draft, placement.id, candidatePlacement.id);
                    const checked = placement.requires_placed.includes(candidatePlacement.id);
                    const disabled = checked ? false : optionState.disabled;
                    return (
                      <label key={candidatePlacement.id} className={`assembly-dependency-option${disabled ? " assembly-dependency-option-disabled" : ""}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          aria-label={`${candidatePlacement.id} ${candidatePlacement.display_name}`}
                          onChange={(event) => handleDependencyToggle(candidatePlacement.id, event.target.checked)}
                        />
                        <span>{candidatePlacement.id}</span>
                        <small>{candidatePlacement.display_name}</small>
                      </label>
                    );
                  })}
                </div>
              </section>

              <div className="assembly-property-actions">
                <ConfirmActionDialog
                  trigger={(
                    <button type="button" className="course-planner-secondary-action">
                      Remove placement
                    </button>
                  )}
                  title={`Remove ${placement.display_name}?`}
                  description="This removes the placement from layer order, groups, and any dependency lists that point to it."
                  confirmLabel="Confirm removal"
                  onConfirm={handleRemovePlacement}
                />
              </div>
            </>
          ) : null}
        </>
      ) : (
        <div className="assembly-editor-empty-state assembly-editor-empty-state-compact">
          <div>
            <strong>Select a placement to inspect its details.</strong>
            <p>The layer tree and the asset pool's Locate Placement action drive this panel.</p>
          </div>
        </div>
      )}
    </section>
  );
}

function resolveSelectedRole(placements: AssemblyManifestDraft["placements"]): RuntimeRole | null {
  const firstRole = placements[0]?.runtime_role ?? null;
  if (!firstRole) {
    return null;
  }
  return placements.every((placement) => placement.runtime_role === firstRole) ? firstRole : null;
}
