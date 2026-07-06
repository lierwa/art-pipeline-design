import { Trash2 } from "lucide-react";

import { ConfirmActionDialog } from "../../../shared/ui/ConfirmActionDialog";
import {
  removePlacement,
  setPlacementRuntimeRole,
  updatePlacementTransform,
  type AssemblyManifestDraft,
} from "../assembly/assemblyManifestDraft";
import type { RuntimeRole } from "../types";
import { readablePlacementName } from "./assemblyDisplayNames";
import { CoursePlannerStatusBadge } from "./CoursePlannerChrome";

type AssemblyPlacementPropertiesProps = {
  alignmentRiskPlacementIds: string[];
  draft: AssemblyManifestDraft;
  onDraftChange: (draft: AssemblyManifestDraft) => void;
  onSelectionChange: (placementId: string | null, placementIds: string[]) => void;
  selectedPlacementId: string | null;
  selectedPlacementIds: string[];
};

type PlacementDraft = AssemblyManifestDraft["placements"][number];
type EmptySceneSize = NonNullable<AssemblyManifestDraft["empty_scene_size"]>;
type TransformFieldKey = typeof TRANSFORM_FIELDS[number]["key"];

const TRANSFORM_FIELDS = [
  { key: "cx", label: "Position X", unit: "px", dimension: "width", step: 1, requiresPositive: false },
  { key: "cy", label: "Position Y", unit: "px", dimension: "height", step: 1, requiresPositive: false },
  { key: "w", label: "Width", unit: "px", dimension: "width", step: 1, requiresPositive: true },
  { key: "h", label: "Height", unit: "px", dimension: "height", step: 1, requiresPositive: true },
  { key: "rotation_deg", label: "Rotation", unit: "degrees", dimension: null, step: 1, requiresPositive: false },
] as const;

// WHY: 属性面板只负责编辑 manifest draft 已经定义好的 placement 事实，
// 把 batch role、transform、remove 都收束到同一边界，避免 layer list/canvas 各自偷写协议字段。
export function AssemblyPlacementProperties({
  alignmentRiskPlacementIds,
  draft,
  onDraftChange,
  onSelectionChange,
  selectedPlacementId,
  selectedPlacementIds,
}: AssemblyPlacementPropertiesProps) {
  const selection = resolvePlacementSelection(draft, selectedPlacementId, selectedPlacementIds, alignmentRiskPlacementIds);

  function handleRoleChange(role: RuntimeRole) {
    if (selection.selectedPlacements.length === 0) {
      return;
    }
    onDraftChange(setPlacementRuntimeRole(draft, selection.selectedPlacements.map((item) => item.id), role));
  }

  function handleNameChange(name: string) {
    if (!selection.placement || selection.selectedPlacements.length !== 1) {
      return;
    }
    onDraftChange({
      ...draft,
      placements: draft.placements.map((placement) => (
        placement.id === selection.placement?.id
          ? { ...placement, display_name: name }
          : placement
      )),
    });
  }

  function handleTransformChange(key: TransformFieldKey, value: number) {
    if (selection.selectedPlacements.length === 0) {
      return;
    }
    if (!Number.isFinite(value)) {
      return;
    }
    onDraftChange(
      selection.selectedPlacements.reduce(
        (nextDraft, placement) => updatePlacementTransform(nextDraft, placement.id, {
          ...placement.transform,
          [key]: value,
        }),
        draft,
      ),
    );
  }

  function handleRemovePlacement() {
    if (selection.selectedPlacements.length === 0) {
      return;
    }
    const nextDraft = selection.selectedPlacements.reduce(
      (currentDraft, placement) => removePlacement(currentDraft, placement.id),
      draft,
    );
    onDraftChange(nextDraft);
    onSelectionChange(null, []);
  }

  return (
    <section className="chapter-studio-panel chapter-studio-panel-stack assembly-placement-properties-panel" aria-label="Placement properties">
      <PlacementPanelHeader
        hasAlignmentRisk={selection.hasAlignmentRisk}
        onRemovePlacement={selection.selectedPlacements.length > 0 ? handleRemovePlacement : null}
        placementName={selection.placementName}
        selectedCount={selection.selectedPlacements.length}
      />
      <PlacementPanelBody
        emptySceneSize={draft.empty_scene_size}
        onNameChange={handleNameChange}
        onRoleChange={handleRoleChange}
        onTransformChange={handleTransformChange}
        placement={selection.placement}
        placementName={selection.placementName}
        selectedPlacements={selection.selectedPlacements}
        selectedCount={selection.selectedPlacements.length}
        selectedRole={selection.selectedRole}
        showAlignmentRisk={selection.hasAlignmentRisk}
      />
    </section>
  );
}

function PlacementPanelHeader({
  hasAlignmentRisk,
  onRemovePlacement,
  placementName,
  selectedCount,
}: {
  hasAlignmentRisk: boolean;
  onRemovePlacement: (() => void) | null;
  placementName: string | null;
  selectedCount: number;
}) {
  return (
    <div className="chapter-studio-panel-heading assembly-placement-properties-heading">
      <div>
        <h2>Placement</h2>
        <p>{selectedCount > 1 ? `${selectedCount} selected` : placementName ?? "No selection"}</p>
      </div>
      <div className="assembly-placement-heading-actions">
        {hasAlignmentRisk ? <CoursePlannerStatusBadge tone="warning">Alignment risk</CoursePlannerStatusBadge> : null}
        {onRemovePlacement ? (
          <PlacementRemoveAction
            placementName={placementName}
            selectedCount={selectedCount}
            onRemovePlacement={onRemovePlacement}
          />
        ) : null}
      </div>
    </div>
  );
}

function PlacementPanelBody({
  emptySceneSize,
  onNameChange,
  onRoleChange,
  onTransformChange,
  placement,
  placementName,
  selectedPlacements,
  selectedCount,
  selectedRole,
  showAlignmentRisk,
}: {
  emptySceneSize: AssemblyManifestDraft["empty_scene_size"];
  onNameChange: (name: string) => void;
  onRoleChange: (role: RuntimeRole) => void;
  onTransformChange: (key: TransformFieldKey, value: number) => void;
  placement: PlacementDraft | null;
  placementName: string | null;
  selectedPlacements: PlacementDraft[];
  selectedCount: number;
  selectedRole: RuntimeRole | null;
  showAlignmentRisk: boolean;
}) {
  if (selectedCount === 0) {
    return <PlacementEmptyState />;
  }

  return (
    <div className="assembly-property-compact">
      {showAlignmentRisk ? <PlacementAlignmentNote /> : null}
      <div className="assembly-property-summary-grid">
        {placement && selectedCount === 1 ? (
          <PlacementNameField placementName={placementName ?? placement.display_name} onNameChange={onNameChange} />
        ) : (
          <PlacementBatchSummary selectedCount={selectedCount} />
        )}
        <RuntimeRoleControl onRoleChange={onRoleChange} selectedRole={selectedRole} />
      </div>
      {selectedPlacements.length > 0 ? (
        <TransformEditor
          emptySceneSize={emptySceneSize}
          selectedPlacements={selectedPlacements}
          onTransformChange={onTransformChange}
        />
      ) : null}
    </div>
  );
}

function PlacementNameField({
  onNameChange,
  placementName,
}: {
  onNameChange: (name: string) => void;
  placementName: string;
}) {
  return (
    <label className="assembly-field assembly-property-name-field">
      <span>Name</span>
      <input
        aria-label="Name"
        type="text"
        value={placementName}
        onChange={(event) => onNameChange(event.target.value)}
      />
    </label>
  );
}

function RuntimeRoleControl({
  onRoleChange,
  selectedRole,
}: {
  onRoleChange: (role: RuntimeRole) => void;
  selectedRole: RuntimeRole | null;
}) {
  return (
    <div className="assembly-property-row assembly-property-role-row" aria-label="Placement role">
      <span className="assembly-property-row-label">Role</span>
      <div className="assembly-segmented-control" role="group" aria-label="Placement role">
        {(["target", "initial"] as const).map((role) => (
          <button
            key={role}
            type="button"
            className={`assembly-segmented-option${selectedRole === role ? " assembly-segmented-option-active" : ""}`}
            aria-pressed={selectedRole === role}
            onClick={() => onRoleChange(role)}
          >
            {role === "target" ? "Target" : "Initial"}
          </button>
        ))}
      </div>
    </div>
  );
}

function TransformEditor({
  emptySceneSize,
  onTransformChange,
  selectedPlacements,
}: {
  emptySceneSize: AssemblyManifestDraft["empty_scene_size"];
  onTransformChange: (key: TransformFieldKey, value: number) => void;
  selectedPlacements: PlacementDraft[];
}) {
  if (!emptySceneSize) {
    return (
      <section className="assembly-property-section" aria-label="Placement geometry">
        <h3>Geometry</h3>
        <div className="assembly-editor-empty-state assembly-editor-empty-state-compact">
          <div>
            <strong>Select an Empty Scene before editing pixel placement.</strong>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="assembly-property-section" aria-label="Placement geometry">
      <h3>Geometry</h3>
      <div className="assembly-transform-grid">
        {TRANSFORM_FIELDS.map((field) => (
          <label key={field.key} className="assembly-field">
            <span>{field.label}</span>
            <span className="assembly-field-input-unit">
              <input
                aria-label={field.label}
                type="number"
                min={field.requiresPositive ? 1 : undefined}
                step={field.step}
                value={formatTransformFieldValue(field, selectedPlacements, emptySceneSize)}
                placeholder={hasMixedTransformFieldValue(field, selectedPlacements, emptySceneSize) ? "Mixed" : undefined}
                onChange={(event) => {
                  const nextValue = resolveTransformFieldValue(field, event.target.value, emptySceneSize);
                  if (nextValue !== null) {
                    onTransformChange(field.key, nextValue);
                    return;
                  }
                  event.currentTarget.value = formatTransformFieldValue(field, selectedPlacements, emptySceneSize);
                }}
              />
              <small aria-hidden="true">{field.unit}</small>
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}

function formatTransformFieldValue(
  field: typeof TRANSFORM_FIELDS[number],
  placements: PlacementDraft[],
  emptySceneSize: EmptySceneSize,
): string {
  const values = placements.map((placement) => formatSingleTransformFieldValue(field, placement, emptySceneSize));
  const firstValue = values[0] ?? "";
  return values.every((value) => value === firstValue) ? firstValue : "";
}

function hasMixedTransformFieldValue(
  field: typeof TRANSFORM_FIELDS[number],
  placements: PlacementDraft[],
  emptySceneSize: EmptySceneSize,
): boolean {
  const values = placements.map((placement) => formatSingleTransformFieldValue(field, placement, emptySceneSize));
  const firstValue = values[0] ?? "";
  return values.some((value) => value !== firstValue);
}

function formatSingleTransformFieldValue(
  field: typeof TRANSFORM_FIELDS[number],
  placement: PlacementDraft,
  emptySceneSize: EmptySceneSize,
): string {
  if (field.dimension === "width") {
    return String(Math.round(placement.transform[field.key] * emptySceneSize.width));
  }
  if (field.dimension === "height") {
    return String(Math.round(placement.transform[field.key] * emptySceneSize.height));
  }
  return String(Math.round(placement.transform.rotation_deg));
}

function resolveTransformFieldValue(
  field: typeof TRANSFORM_FIELDS[number],
  value: string,
  emptySceneSize: EmptySceneSize,
): number | null {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return null;
  }
  // WHY: canvas 与 manifest 协议都假设尺寸为正；在 px inspector 边界拒绝非法尺寸，
  // 避免 live draft 短暂写入 0/负数后再依赖下游 clamp 修补。
  if (field.requiresPositive && numericValue <= 0) {
    return null;
  }
  if (field.dimension === "width") {
    return numericValue / emptySceneSize.width;
  }
  if (field.dimension === "height") {
    return numericValue / emptySceneSize.height;
  }
  return numericValue;
}

function PlacementRemoveAction({
  onRemovePlacement,
  placementName,
  selectedCount,
}: {
  onRemovePlacement: () => void;
  placementName: string | null;
  selectedCount: number;
}) {
  const isBatch = selectedCount > 1;
  const triggerLabel = isBatch ? "Remove selected placements" : "Remove placement";
  const title = isBatch ? `Remove ${selectedCount} placements?` : `Remove ${placementName ?? "placement"}?`;
  const description = isBatch
    ? "This removes the selected placements from layer order, groups, and any dependency lists that point to them."
    : "This removes the placement from layer order, groups, and any dependency lists that point to it.";

  return (
    <div className="assembly-property-actions">
      <ConfirmActionDialog
        trigger={(
          <button
            type="button"
            className="course-planner-secondary-action chapter-studio-icon-action assembly-editor-icon-button"
            aria-label={triggerLabel}
            title={triggerLabel}
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
        )}
        title={title}
        description={description}
        confirmLabel="Confirm removal"
        onConfirm={onRemovePlacement}
      />
    </div>
  );
}

function PlacementAlignmentNote() {
  return (
    <div className="chapter-studio-subpanel assembly-alignment-note">
      <p>Review this preserved placement against the selected Empty Scene before relying on the saved Assembly.</p>
    </div>
  );
}

function PlacementBatchSummary({ selectedCount }: { selectedCount: number }) {
  return (
    <div className="assembly-editor-empty-state assembly-editor-empty-state-compact">
      <div>
        <strong>{selectedCount} placements selected</strong>
        <p>Batch edits apply to role and shared geometry fields.</p>
      </div>
    </div>
  );
}

function PlacementEmptyState() {
  return (
    <div className="assembly-editor-empty-state assembly-editor-empty-state-compact">
      <div>
        <strong>Select a placement to inspect its details.</strong>
        <p>The layer tree and the asset pool's Locate Placement action drive this panel.</p>
      </div>
    </div>
  );
}

function resolvePlacementSelection(
  draft: AssemblyManifestDraft,
  selectedPlacementId: string | null,
  selectedPlacementIds: string[],
  alignmentRiskPlacementIds: string[],
) {
  const alignmentRiskPlacementIdSet = new Set(alignmentRiskPlacementIds);
  const placementsById = new Map(draft.placements.map((placement) => [placement.id, placement]));
  const selectedPlacements = selectedPlacementIds
    .map((placementId) => placementsById.get(placementId))
    .filter((placement): placement is PlacementDraft => Boolean(placement));
  const placement = selectedPlacementId ? placementsById.get(selectedPlacementId) ?? null : null;

  return {
    hasAlignmentRisk: selectedPlacements.some((item) => alignmentRiskPlacementIdSet.has(item.id)),
    placement,
    placementName: placement ? readablePlacementName(placement.display_name, placement.asset_id) : null,
    selectedPlacements,
    selectedRole: resolveSelectedRole(selectedPlacements),
  };
}

function resolveSelectedRole(placements: AssemblyManifestDraft["placements"]): RuntimeRole | null {
  const firstRole = placements[0]?.runtime_role ?? null;
  if (!firstRole) {
    return null;
  }
  return placements.every((placement) => placement.runtime_role === firstRole) ? firstRole : null;
}
