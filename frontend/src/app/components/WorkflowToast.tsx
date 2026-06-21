import * as Toast from "@radix-ui/react-toast";
import { AlertTriangle, Loader2 } from "lucide-react";

export type WorkflowToastTone = "danger" | "progress";

export type WorkflowToastState = {
  tone: WorkflowToastTone;
  title: string;
  message: string;
};

type WorkflowToastProps = {
  toast: WorkflowToastState | null;
  errorDurationMs?: number;
  onDismiss: () => void;
};

export function WorkflowToast({
  toast,
  errorDurationMs = 2000,
  onDismiss,
}: WorkflowToastProps) {
  const Icon = toast?.tone === "danger" ? AlertTriangle : Loader2;

  return (
    <Toast.Provider
      swipeDirection="right"
      duration={
        toast?.tone === "danger"
          ? errorDurationMs
          : 2147483647
      }
    >
      {toast ? (
        // WHY: 这里是操作反馈 toast，不是需要阻断流程的 alert；脱离画布布局后不会遮挡 prompt 输入框。
        <Toast.Root
          key={`${toast.tone}:${toast.title}:${toast.message}`}
          className={`workflow-toast is-${toast.tone}`}
          open
          type={toast.tone === "danger" ? "foreground" : "background"}
          onOpenChange={(open) => {
            if (!open) {
              onDismiss();
            }
          }}
        >
          <span className="workflow-toast-icon" aria-hidden="true">
            <Icon
              size={17}
              strokeWidth={2.3}
              className={toast.tone === "progress" ? "is-spinning" : undefined}
            />
          </span>
          <div className="workflow-toast-copy">
            <Toast.Title className="workflow-toast-title">{toast.title}</Toast.Title>
            <Toast.Description className="workflow-toast-description">
              {toast.message}
            </Toast.Description>
          </div>
        </Toast.Root>
      ) : null}
      <Toast.Viewport className="workflow-toast-viewport" />
    </Toast.Provider>
  );
}
