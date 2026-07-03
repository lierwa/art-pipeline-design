import type { ChapterScenePackage } from "../types";
import { CoursePlannerStatusBadge } from "./CoursePlannerChrome";

type LibrarySelectionPanelProps = {
  scenePackage: ChapterScenePackage;
};

export function LibrarySelectionPanel({ scenePackage }: LibrarySelectionPanelProps) {
  const hasCharacterIp = scenePackage.cast_assignments.length > 0;
  const hasReferenceSelection = scenePackage.reference_selections.length > 0 || scenePackage.prompt_confirmations.style_reference_mode === "confirmed_empty";
  const hasAvoidReview = scenePackage.prompt_confirmations.avoid_objects_reviewed;

  return (
    <section className="chapter-studio-panel chapter-studio-panel-stack" aria-label="Library selection">
      <div className="chapter-studio-panel-heading">
        <div>
          <h2>Library Selection</h2>
          <p>Chapter readiness gates</p>
        </div>
      </div>

      <div className="chapter-studio-readiness-list">
        <ReadinessRow label="Character IP" ready={hasCharacterIp} detail={`${scenePackage.cast_assignments.length} linked`} />
        <ReadinessRow
          label="Reference Library"
          ready={hasReferenceSelection}
          detail={
            scenePackage.prompt_confirmations.style_reference_mode === "confirmed_empty"
              ? "Confirmed empty"
              : `${scenePackage.reference_selections.length} selected`
          }
        />
        <ReadinessRow label="Avoid reviewed" ready={hasAvoidReview} detail={`${scenePackage.avoid_objects.length} avoid objects`} />
      </div>
    </section>
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
