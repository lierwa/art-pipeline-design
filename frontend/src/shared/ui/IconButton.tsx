import { ButtonHTMLAttributes, ReactNode } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  label: string;
  icon: ReactNode;
  isActive?: boolean;
  showLabel?: boolean;
  tooltipSide?: Tooltip.TooltipContentProps["side"];
};

export function IconButton({
  label,
  icon,
  isActive = false,
  showLabel = false,
  tooltipSide = "bottom",
  className,
  ...buttonProps
}: IconButtonProps) {
  const buttonClassName = [
    "shared-icon-button",
    showLabel ? "shared-icon-button-with-label" : "",
    isActive ? "is-active" : "",
    className ?? "",
  ].filter(Boolean).join(" ");
  const ariaLabel = buttonProps["aria-label"] ?? (showLabel ? undefined : label);

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          {...buttonProps}
          aria-label={ariaLabel}
          className={buttonClassName}
          title={undefined}
          type={buttonProps.type ?? "button"}
        >
          <span className="shared-icon-button-icon" aria-hidden="true">{icon}</span>
          {showLabel ? <span className="shared-icon-button-label">{label}</span> : null}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip-content" side={tooltipSide} sideOffset={8}>
          {label}
          <Tooltip.Arrow className="tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
