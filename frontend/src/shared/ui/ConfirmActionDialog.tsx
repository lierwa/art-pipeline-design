import type { ReactNode } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";

type ConfirmActionDialogProps = {
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
};

export function ConfirmActionDialog({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
}: ConfirmActionDialogProps) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="confirm-dialog-overlay" data-confirm-dialog />
        <AlertDialog.Content className="confirm-dialog-content" data-confirm-dialog>
          <AlertDialog.Title className="confirm-dialog-title">{title}</AlertDialog.Title>
          <AlertDialog.Description className="confirm-dialog-description">
            {description}
          </AlertDialog.Description>
          <div className="confirm-dialog-actions">
            <AlertDialog.Cancel className="confirm-dialog-cancel">
              {cancelLabel}
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                type="button"
                className="confirm-dialog-danger"
                onClick={() => {
                  void onConfirm();
                }}
              >
                {confirmLabel}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
