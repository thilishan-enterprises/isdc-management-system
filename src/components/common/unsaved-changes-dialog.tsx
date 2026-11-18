"use client";

import { ConfirmationDialog } from "@/components/common/confirmation-dialog";

type UnsavedChangesDialogProps = {
  open: boolean;
  onStay: () => void;
  onDiscard: () => void;
};

export function UnsavedChangesDialog({
  open,
  onStay,
  onDiscard,
}: UnsavedChangesDialogProps) {
  return (
    <ConfirmationDialog
      open={open}
      title="Unsaved changes"
      description="You have unsaved changes on this page. If you leave now, your entered information will be lost."
      confirmLabel="Discard & Leave"
      cancelLabel="Stay on Page"
      onCancel={onStay}
      onConfirm={onDiscard}
    />
  );
}
