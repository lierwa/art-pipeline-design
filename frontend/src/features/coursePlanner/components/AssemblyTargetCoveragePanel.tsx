import type { AssemblyTargetCoverageItem } from "../assembly/assemblyReadiness";
import { CoursePlannerStatusBadge } from "./CoursePlannerChrome";

type AssemblyTargetCoveragePanelProps = {
  items: AssemblyTargetCoverageItem[];
};

export function AssemblyTargetCoveragePanel({
  items,
}: AssemblyTargetCoveragePanelProps) {
  return (
    <section
      className="chapter-studio-panel chapter-studio-panel-stack"
      aria-label="Assembly target coverage"
    >
      <div className="chapter-studio-panel-heading">
        <div>
          <h2>Target coverage</h2>
          <p>{items.length} target objects</p>
        </div>
      </div>

      <div className="chapter-studio-card-list">
        {items.map((item) => {
          return (
            <article key={item.target.id} className="chapter-studio-mini-card">
              <div className="chapter-studio-card-header">
                <div>
                  <h4>{item.target.label}</h4>
                  <p>{item.target.priority}</p>
                </div>
                <CoursePlannerStatusBadge
                  tone={
                    item.status === "covered"
                      ? "success"
                      : "danger"
                  }
                >
                  {item.status === "covered"
                    ? "Covered"
                    : "Missing"}
                </CoursePlannerStatusBadge>
              </div>
              {item.target.description ? <p>{item.target.description}</p> : null}
              {item.status === "covered" ? (
                <p>{item.covered_asset_names.join(", ")}</p>
              ) : null}
              {item.status === "missing" && item.exemption_reason ? (
                <p>{`Note: ${item.exemption_reason}`}</p>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
