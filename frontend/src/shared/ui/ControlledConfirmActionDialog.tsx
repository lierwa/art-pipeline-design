import * as AlertDialog from "@radix-ui/react-alert-dialog";

export type ControlledConfirmActionDialogProps = {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  isConfirming?: boolean;
  onConfirm: () => void | Promise<void>;
  onOpenChange: (isOpen: boolean) => void;
};

export function ControlledConfirmActionDialog({
  cancelLabel = "取消",
  confirmLabel,
  description,
  isConfirming = false,
  isOpen,
  onConfirm,
  onOpenChange,
  title,
}: ControlledConfirmActionDialogProps) {
  return (
    <AlertDialog.Root open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="confirm-dialog-overlay" data-confirm-dialog />
        <AlertDialog.Content className="confirm-dialog-content" data-confirm-dialog>
          <AlertDialog.Title className="confirm-dialog-title">{title}</AlertDialog.Title>
          <AlertDialog.Description className="confirm-dialog-description">
            {description}
          </AlertDialog.Description>
          <div className="confirm-dialog-actions">
            <AlertDialog.Cancel className="confirm-dialog-cancel" disabled={isConfirming}>
              {cancelLabel}
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                type="button"
                className="confirm-dialog-danger"
                disabled={isConfirming}
                onClick={() => {
                  // WHY: AlertDialog 负责关闭与焦点恢复，业务层只承担可能异步的副作用。
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
