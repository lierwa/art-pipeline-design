import { useRef, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tooltip from "@radix-ui/react-tooltip";
import { X } from "lucide-react";

import { IconButton } from "../../../shared/ui/IconButton";
import "./coursePlannerDrawer.css";

export type CoursePlannerDrawerProps = {
  title: string;
  description?: string;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  modal?: boolean;
};

export function CoursePlannerDrawer({
  children,
  description,
  footer,
  isOpen,
  modal = false,
  onClose,
  title,
}: CoursePlannerDrawerProps) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  return (
    <Dialog.Root
      modal={modal}
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        {modal ? <Dialog.Overlay className="course-planner-drawer-backdrop" /> : null}
        <Dialog.Content
          {...(description ? {} : { "aria-describedby": undefined })}
          className="course-planner-drawer"
          ref={contentRef}
          onInteractOutside={(event) => {
            if (!modal) {
              // WHY: 非模态侧栏允许操作画布，但背景交互不等同于用户明确关闭侧栏。
              event.preventDefault();
            }
          }}
          onOpenAutoFocus={(event) => {
            // WHY: 外部按钮控制 Drawer 时没有 Dialog.Trigger；仅在真正打开时记录焦点，
            // 避免父组件普通重渲染把输入焦点反复抢回关闭按钮。
            previouslyFocusedElementRef.current = document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
            // WHY: 先聚焦容器可让用户进入焦点圈，同时避免关闭按钮的 Tooltip 在打开瞬间遮挡标题。
            event.preventDefault();
            contentRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            previouslyFocusedElementRef.current?.focus();
            previouslyFocusedElementRef.current = null;
          }}
        >
          <header className="course-planner-drawer-header">
            <div className="course-planner-drawer-heading">
              <Dialog.Title asChild>
                <h2>{title}</h2>
              </Dialog.Title>
              {description ? (
                <Dialog.Description asChild>
                  <p>{description}</p>
                </Dialog.Description>
              ) : null}
            </div>
            <Tooltip.Provider>
              <IconButton
                className="course-planner-drawer-close"
                icon={<X size={16} />}
                label={`关闭${title}`}
                onClick={onClose}
              />
            </Tooltip.Provider>
          </header>
          <div className="course-planner-drawer-body">{children}</div>
          {footer ? <footer className="course-planner-drawer-footer">{footer}</footer> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
