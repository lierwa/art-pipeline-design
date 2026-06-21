import { ReactNode, useState } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";

type FloatingStageDrawerProps = {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  onClose?: () => void;
};

export function FloatingStageDrawer({
  title,
  children,
  actions,
  onClose,
}: FloatingStageDrawerProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <aside
      aria-label={title}
      className={`floating-stage-drawer${isCollapsed ? " is-collapsed" : ""}`}
      role="dialog"
    >
      <div className="floating-stage-drawer-header">
        <div>
          <span>Stage workbench</span>
          <h2>{title}</h2>
        </div>
        <div className="floating-stage-drawer-actions">
          {actions}
          <button
            aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${title} drawer`}
            aria-pressed={isCollapsed}
            className="shared-icon-button"
            onClick={() => setIsCollapsed((current) => !current)}
            type="button"
          >
            {isCollapsed ? (
              <Maximize2 aria-hidden="true" size={16} />
            ) : (
              <Minimize2 aria-hidden="true" size={16} />
            )}
          </button>
          {onClose ? (
            <button
              aria-label={`Close ${title} drawer`}
              className="shared-icon-button"
              onClick={onClose}
              type="button"
            >
              <X aria-hidden="true" size={16} />
            </button>
          ) : null}
        </div>
      </div>
      {isCollapsed ? null : <div className="floating-stage-drawer-body">{children}</div>}
    </aside>
  );
}
