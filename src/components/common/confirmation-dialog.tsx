"use client";

import { useRef, type ReactNode } from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type ConfirmationDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  pending?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
};

export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  pending = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
  children,
}: ConfirmationDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !pending) onCancel();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0" />
        <AlertDialog.Viewport className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4">
          <AlertDialog.Popup
            initialFocus={cancelButtonRef}
            className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-background shadow-2xl outline-none data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95"
          >
            <div className="flex items-start justify-between gap-3 border-b border-border/70 px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                  <AlertTriangle className="size-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <AlertDialog.Title className="text-base font-semibold">
                    {title}
                  </AlertDialog.Title>
                </div>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onCancel}
                disabled={pending}
                aria-label="Close dialog"
                className="-mr-1 -mt-1"
              >
                <X className="size-4" />
              </Button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <AlertDialog.Description className="text-xs leading-5 text-muted-foreground">
                {description}
              </AlertDialog.Description>
              {children}
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-border/70 px-5 py-4">
              <Button
                ref={cancelButtonRef}
                type="button"
                variant="outline"
                size="lg"
                onClick={onCancel}
                disabled={pending}
              >
                {cancelLabel}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="lg"
                onClick={onConfirm}
                disabled={pending || confirmDisabled}
              >
                {pending && <Loader2 className="size-4 animate-spin" />}
                {pending ? "Please wait..." : confirmLabel}
              </Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Viewport>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
