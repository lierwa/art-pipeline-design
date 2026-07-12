import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { ArrowLeft, X } from "lucide-react";
import { Link, type LinkProps } from "react-router";
import { Group, Panel, Separator } from "react-resizable-panels";

export { CoursePlannerDrawer, type CoursePlannerDrawerProps } from "./CoursePlannerDrawer";

export type CoursePlannerStatusTone = "neutral" | "info" | "success" | "warning" | "danger";

export type CoursePlannerStatusBadgeProps = {
  ariaLabel?: string;
  label: string;
  role?: "status";
  tone?: CoursePlannerStatusTone;
};

export type CoursePlannerPageHeaderProps = {
  backAction?: ReactNode;
  eyebrow?: string;
  title: string;
  description?: string | null;
  status?: ReactNode;
  actions?: ReactNode;
};

export type CoursePlannerWorkspaceHeaderProps = {
  actions?: ReactNode;
  backAction?: ReactNode;
  backLabel?: string;
  backTo?: string;
  description?: ReactNode;
  eyebrow?: string;
  status?: ReactNode;
  title: string;
  variant?: "framed" | "compact";
};

export type CoursePlannerDialogProps = {
  title: string;
  description?: string;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

export type InlineItemAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  icon?: ReactNode;
};

export type CoursePlannerIconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  ariaLabel: string;
};

export type CoursePlannerIconLinkProps = Omit<LinkProps, "aria-label" | "title"> & {
  ariaLabel: string;
  title?: string;
};

export type InlineItemActionsProps = {
  actions: InlineItemAction[];
  ariaLabel: string;
};

export type CoursePlannerResizablePanelSpec = {
  children: ReactNode;
  className?: string;
  defaultSize: string;
  id: string;
  maxSize?: string;
  minSize: string;
};

export type CoursePlannerResizableColumnsProps = {
  ariaLabel: string;
  center: CoursePlannerResizablePanelSpec;
  className?: string;
  groupId: string;
  left: CoursePlannerResizablePanelSpec;
  right: CoursePlannerResizablePanelSpec;
  storageKey: string;
};

type LegacyStatusTone = CoursePlannerStatusTone | "muted";

type LegacyCoursePlannerPageHeaderProps = {
  backLabel?: string;
  backTo?: string;
  statusTone?: LegacyStatusTone;
  subtitle?: string;
};

type CoursePlannerPageHeaderComponentProps = CoursePlannerPageHeaderProps & LegacyCoursePlannerPageHeaderProps;

type CoursePlannerDialogComponentProps = Omit<CoursePlannerDialogProps, "isOpen"> & {
  isOpen?: boolean;
};

type CoursePlannerStatusBadgeComponentProps = Omit<CoursePlannerStatusBadgeProps, "label" | "tone"> & {
  children?: ReactNode;
  label?: string;
  tone?: LegacyStatusTone;
};

type InlineItemActionsComponentProps =
  | (InlineItemActionsProps & { children?: never })
  | { actions?: undefined; ariaLabel?: string; children: ReactNode };

export function CoursePlannerPageHeader({
  actions,
  backAction,
  backLabel,
  backTo,
  description,
  eyebrow,
  status,
  statusTone = "neutral",
  subtitle,
  title,
}: CoursePlannerPageHeaderComponentProps) {
  const resolvedBackLabel = backLabel ?? "Back";
  const resolvedBackAction = backAction ?? (
    backTo ? (
      <CoursePlannerIconLink ariaLabel={resolvedBackLabel} title={resolvedBackLabel} to={backTo}>
        <ArrowLeft size={16} aria-hidden="true" />
      </CoursePlannerIconLink>
    ) : null
  );
  const resolvedDescription = description ?? subtitle ?? null;
  const resolvedStatus =
    typeof status === "string"
      ? <CoursePlannerStatusBadge ariaLabel={status} label={status} role="status" tone={normalizeStatusTone(statusTone)} />
      : status;

  return (
    <div className="course-planner-page-header">
      <div className="course-planner-page-header-action">{resolvedBackAction}</div>
      <div className="course-planner-page-header__center course-planner-page-header-title">
        {eyebrow ? <p className="course-planner-kicker">{eyebrow}</p> : null}
        <h1 className="course-planner-page-header__title">{title}</h1>
        {resolvedDescription ? <p className="course-planner-page-header__description">{resolvedDescription}</p> : null}
      </div>
      <div className="course-planner-page-header__actions">
        {resolvedStatus}
        {actions}
      </div>
    </div>
  );
}

export function CoursePlannerWorkspaceHeader({
  actions,
  backAction,
  backLabel = "Back",
  backTo,
  description,
  eyebrow,
  status,
  title,
  variant = "framed",
}: CoursePlannerWorkspaceHeaderProps) {
  const resolvedBackAction = backAction ?? (
    backTo ? (
      <CoursePlannerIconLink ariaLabel={backLabel} title={backLabel} to={backTo}>
        <ArrowLeft size={16} aria-hidden="true" />
      </CoursePlannerIconLink>
    ) : null
  );

  return (
    <header className={`course-planner-workspace-header course-planner-workspace-header-${variant}`}>
      <div className="course-planner-workspace-header__back">{resolvedBackAction}</div>
      <div className="course-planner-workspace-header__main">
        {eyebrow ? <p className="course-planner-kicker">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      <div className="course-planner-workspace-header__actions">
        {status}
        {actions}
      </div>
    </header>
  );
}

export function CoursePlannerResizableColumns({
  ariaLabel,
  center,
  className,
  groupId,
  left,
  right,
  storageKey,
}: CoursePlannerResizableColumnsProps) {
  const panelIds = [left.id, center.id, right.id];
  const defaultLayout = {
    [left.id]: panelSizeToLayoutNumber(left.defaultSize),
    [center.id]: panelSizeToLayoutNumber(center.defaultSize),
    [right.id]: panelSizeToLayoutNumber(right.defaultSize),
  };

  return (
    <Group
      aria-label={ariaLabel}
      className={classNames("course-planner-resizable-columns", className)}
      data-panel-group={groupId}
      defaultLayout={readCoursePlannerPanelLayout(storageKey, defaultLayout, panelIds)}
      id={groupId}
      onLayoutChanged={(layout) => storeCoursePlannerPanelLayout(storageKey, layout)}
      orientation="horizontal"
      style={{ height: "100%" }}
    >
      <CoursePlannerResizablePanel spec={left} />
      <CoursePlannerResizeHandle label={`Resize ${left.id}`} />
      <CoursePlannerResizablePanel spec={center} />
      <CoursePlannerResizeHandle label={`Resize ${right.id}`} />
      <CoursePlannerResizablePanel spec={right} />
    </Group>
  );
}

function CoursePlannerResizablePanel({ spec }: { spec: CoursePlannerResizablePanelSpec }) {
  return (
    <Panel
      className={classNames("course-planner-resizable-panel", spec.className)}
      defaultSize={spec.defaultSize}
      id={spec.id}
      maxSize={spec.maxSize}
      minSize={spec.minSize}
    >
      {spec.children}
    </Panel>
  );
}

function CoursePlannerResizeHandle({ label }: { label: string }) {
  return (
    <Separator aria-label={label} className="course-planner-resize-handle">
      <span aria-hidden="true" />
    </Separator>
  );
}

export const CoursePlannerIconButton = forwardRef<HTMLButtonElement, CoursePlannerIconButtonProps>(function CoursePlannerIconButton(
  {
    ariaLabel,
    children,
    className,
    title,
    type = "button",
    ...buttonProps
  },
  ref,
) {
  // WHY: icon-only controls need one authoritative accessibility contract; callers provide intent once,
  // and this component keeps aria-label/title/class aligned across buttons.
  const resolvedTitle = title ?? ariaLabel;
  return (
    <button
      {...buttonProps}
      ref={ref}
      type={type}
      className={classNames("course-planner-icon-button", "course-planner-compact-icon-action", className)}
      aria-label={ariaLabel}
      title={resolvedTitle}
    >
      {children}
    </button>
  );
});

export function CoursePlannerIconLink({
  ariaLabel,
  children,
  className,
  title,
  ...linkProps
}: CoursePlannerIconLinkProps) {
  // WHY: links and buttons share the same visual affordance, but links must keep router semantics.
  // Centralizing the icon-only contract prevents visible fallback text from drifting back in.
  const resolvedTitle = title ?? ariaLabel;
  return (
    <Link
      {...linkProps}
      className={classNames("course-planner-icon-link", "course-planner-compact-link", className)}
      aria-label={ariaLabel}
      title={resolvedTitle}
    >
      {children}
    </Link>
  );
}

export function CoursePlannerStatusBadge({
  ariaLabel,
  children,
  label,
  role,
  tone = "neutral",
}: CoursePlannerStatusBadgeComponentProps) {
  const content = label ?? children;
  if (!content) {
    return null;
  }

  return (
    <span
      aria-label={ariaLabel}
      className={`course-planner-status-badge course-planner-status-badge-${normalizeStatusTone(tone)}`}
      role={role}
    >
      {content}
    </span>
  );
}

export function CoursePlannerDialog({
  children,
  description,
  footer,
  isOpen = true,
  onClose,
  title,
}: CoursePlannerDialogComponentProps) {
  const titleId = `course-planner-dialog-${slugFromTitle(title)}`;
  const descriptionId = description ? `${titleId}-description` : undefined;

  if (!isOpen) {
    return null;
  }

  return (
    <section className="course-planner-dialog-backdrop">
      <div
        className="course-planner-dialog"
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        role="dialog"
      >
        <div className="course-planner-dialog-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <CoursePlannerIconButton ariaLabel="Close" onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </CoursePlannerIconButton>
        </div>
        <div className="course-planner-dialog-body">{children}</div>
        {footer ? <div className="course-planner-dialog-footer">{footer}</div> : null}
      </div>
    </section>
  );
}

export function InlineItemActions(props: InlineItemActionsComponentProps) {
  if ("actions" in props && props.actions) {
    return (
      <div className="course-planner-inline-actions" aria-label={props.ariaLabel} role="group">
        {props.actions.map((action) => {
          if (action.icon) {
            // WHY: icon-only row actions must go through the same compact control as hand-written actions;
            // otherwise parent button selectors silently reintroduce padded text-button sizing.
            return (
              <CoursePlannerIconButton
                key={action.label}
                ariaLabel={action.label}
                className={action.destructive ? "course-planner-inline-action is-destructive" : "course-planner-inline-action"}
                disabled={action.disabled}
                onClick={action.onClick}
              >
                {action.icon}
              </CoursePlannerIconButton>
            );
          }
          return (
            <button
              key={action.label}
              type="button"
              className={action.destructive ? "course-planner-inline-action is-destructive" : "course-planner-inline-action"}
              disabled={action.disabled}
              onClick={action.onClick}
            >
              <span>{action.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="course-planner-inline-actions" aria-label={props.ariaLabel} role={props.ariaLabel ? "group" : undefined}>
      {props.children}
    </div>
  );
}

function normalizeStatusTone(tone: LegacyStatusTone): CoursePlannerStatusTone {
  // WHY: Task 2 统一了 badge 的 tone 集合，但 01 现有页面仍会传 `muted`；
  // 这里做单点兼容，避免每个消费方各自分叉一套状态语义。
  return tone === "muted" ? "neutral" : tone;
}

function slugFromTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "panel";
}

function readCoursePlannerPanelLayout(
  storageKey: string,
  fallback: Record<string, number>,
  panelIds: string[],
) {
  if (typeof window === "undefined") {
    return fallback;
  }
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) {
      return fallback;
    }
    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) && panelIds.every((panelId) => typeof parsed[panelId] === "number")
      ? parsed
      : fallback;
  } catch {
    return fallback;
  }
}

function storeCoursePlannerPanelLayout(storageKey: string, layout: unknown) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    // WHY: Scene / Chapter / Assembly 都需要可调侧栏；复用成熟的 react-resizable-panels，
    // 并只持久化尺寸协议，避免每个页面各自维护一套宽度状态机。
    window.localStorage.setItem(storageKey, JSON.stringify(layout));
  } catch {
    // Ignore storage failures; layout still works with defaults.
  }
}

function panelSizeToLayoutNumber(size: string) {
  const parsed = Number.parseFloat(size);
  return Number.isFinite(parsed) ? parsed : 33;
}

function classNames(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}
