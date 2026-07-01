import { X } from "lucide-react";
import { type ReactNode } from "react";
import { Link } from "react-router";

export type CoursePlannerStatusTone = "neutral" | "info" | "success" | "warning" | "danger";

export type CoursePlannerStatusBadgeProps = {
  label: string;
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

export type CoursePlannerDialogProps = {
  title: string;
  description?: string;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

export type CoursePlannerDrawerProps = {
  title: string;
  description?: string;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  ariaLabel?: string;
};

export type InlineItemAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  icon?: ReactNode;
};

export type InlineItemActionsProps = {
  actions: InlineItemAction[];
  ariaLabel: string;
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

type LegacyCoursePlannerDrawerProps = {
  closeButton?: ReactNode;
  isOpen?: boolean;
  kicker?: string;
  onClose?: () => void;
};

type CoursePlannerDrawerComponentProps = Omit<CoursePlannerDrawerProps, "isOpen"> & LegacyCoursePlannerDrawerProps;

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
  const resolvedBackAction = backAction ?? (backTo ? <Link to={backTo}>{backLabel ?? "Back"}</Link> : null);
  const resolvedDescription = description ?? subtitle ?? null;
  const resolvedStatus =
    typeof status === "string" ? <CoursePlannerStatusBadge label={status} tone={normalizeStatusTone(statusTone)} /> : status;

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

export function CoursePlannerStatusBadge({
  children,
  label,
  tone = "neutral",
}: CoursePlannerStatusBadgeComponentProps) {
  const content = label ?? children;
  if (!content) {
    return null;
  }

  return (
    <span className={`course-planner-status-badge course-planner-status-badge-${normalizeStatusTone(tone)}`}>{content}</span>
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
          <button type="button" className="course-planner-icon-button" aria-label="Close" onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="course-planner-dialog-body">{children}</div>
        {footer ? <div className="course-planner-dialog-footer">{footer}</div> : null}
      </div>
    </section>
  );
}

export function CoursePlannerDrawer({
  ariaLabel,
  children,
  closeButton,
  description,
  footer,
  isOpen = true,
  kicker,
  onClose = () => {},
  title,
}: CoursePlannerDrawerComponentProps) {
  const titleId = `course-planner-drawer-${slugFromTitle(title)}`;
  const descriptionId = description ? `${titleId}-description` : undefined;

  if (!isOpen) {
    return null;
  }

  return (
    <aside
      className="course-planner-drawer"
      aria-describedby={descriptionId}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabel ? undefined : titleId}
      role="complementary"
    >
      <div className="course-planner-drawer-header">
        <div>
          {kicker ? <span>{kicker}</span> : null}
          <h2 id={titleId}>{title}</h2>
          {description ? <p id={descriptionId}>{description}</p> : null}
        </div>
        {closeButton ?? (
          <button type="button" className="course-planner-icon-button" aria-label="Close" onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="course-planner-drawer-body">{children}</div>
      {footer ? <div className="course-planner-drawer-footer">{footer}</div> : null}
    </aside>
  );
}

export function InlineItemActions(props: InlineItemActionsComponentProps) {
  if ("actions" in props && props.actions) {
    return (
      <div className="course-planner-inline-actions" aria-label={props.ariaLabel} role="group">
        {props.actions.map((action) => (
          <button
            key={action.label}
            type="button"
            className={action.destructive ? "course-planner-inline-action is-destructive" : "course-planner-inline-action"}
            disabled={action.disabled}
            onClick={action.onClick}
          >
            {action.icon}
            <span>{action.label}</span>
          </button>
        ))}
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
