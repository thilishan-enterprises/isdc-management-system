"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Eye,
  Pencil,
  Trash2,
  ShieldCheck,
  CheckCircle2,
  Info,
} from "lucide-react";
import {
  deleteCustomers,
  type DeleteCustomersResult,
} from "@/app/(app)/customers/management-actions";
import { CustomerDetailsModal } from "@/components/customers/customer-details-modal";
import { notify } from "@/lib/notify";
import { ConfirmationDialog } from "@/components/common/confirmation-dialog";

type Props = {
  selectedIds: string[];
  role: "ADMIN" | "STAFF";
  onClear: () => void;
};

type PendingAction = "delete" | null;

export function CustomerSelectionActions({
  selectedIds,
  role,
  onClear,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [action, setAction] = useState<PendingAction>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const [result, setResult] = useState<DeleteCustomersResult | null>(null);

  const [customerModal, setCustomerModal] = useState<{
    customerId: string;
    mode: "view" | "edit";
  } | null>(null);

  const singleSelected = selectedIds.length === 1;

  function closeDialog() {
    if (pending) return;

    setAction(null);
    setPassword("");
    setError("");
  }

  function openDeleteDialog() {
    if (pending || selectedIds.length === 0) return;

    setError("");
    setPassword("");
    setAction("delete");
  }

  function handleView() {
    if (!singleSelected || pending) return;

    setCustomerModal({
      customerId: selectedIds[0],
      mode: "view",
    });
  }

  function handleEdit() {
    if (!singleSelected || pending) return;

    setCustomerModal({
      customerId: selectedIds[0],
      mode: "edit",
    });
  }

  function closeCustomerModal() {
    setCustomerModal(null);

    // Clear selection after closing View/Edit.
    onClear();
  }

  function handleDelete() {
    if (pending || selectedIds.length === 0) return;

    if (role === "STAFF" && !password.trim()) {
      setError("Please enter an administrator password.");
      return;
    }

    setError("");

    // Capture selected IDs before starting the operation.
    const customerIds = [...selectedIds];

    startTransition(async () => {
      try {
        const response = await deleteCustomers({
          customerIds,
          adminPassword: role === "STAFF" ? password : undefined,
        });

        if (!response.success) {
          notify.error("Customer deletion failed", {
            description: response.error ?? "Unable to delete customers.",
          });
          return;
        }

        if (response.blocked.length === 0) {
          notify.success("Deletion completed", {
            description: `${response.deletedCount} customer(s) permanently deleted.`,
          });
        } else {
          notify.warning("Deletion completed with restrictions", {
            description: `${response.deletedCount} deleted, ${response.blocked.length} retained because of existing sales.`,
          });
        }

        setResult(response);
        setAction(null);
        setPassword("");
        setError("");

        // Clear selection immediately after a completed operation.
        onClear();

        // Refresh table data.
        router.refresh();
      } catch {
        setError("An unexpected error occurred. Please try again.");

        notify.error("Something went wrong", {
          description: "Unable to complete customer deletion.",
        });
      }
    });
  }

  function closeResult() {
    setResult(null);
    onClear();
  }

  return (
    <>
      {/* Selection actions */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={!singleSelected || pending}
          onClick={handleView}
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-input bg-background px-3 text-xs font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Eye className="size-3.5" />
          View
        </button>

        <button
          type="button"
          disabled={!singleSelected || pending}
          onClick={handleEdit}
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-input bg-background px-3 text-xs font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Pencil className="size-3.5" />
          Edit
        </button>

        <button
          type="button"
          disabled={selectedIds.length === 0 || pending}
          onClick={openDeleteDialog}
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-destructive/30 bg-background px-3 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 className="size-3.5" />
          Delete
        </button>
      </div>

      <ConfirmationDialog
        open={action === "delete"}
        title="Delete Customers"
        description="Confirm permanent deletion"
        confirmLabel="Confirm Delete"
        pending={pending}
        confirmDisabled={role === "STAFF" && !password.trim()}
        onCancel={closeDialog}
        onConfirm={handleDelete}
      >
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
          <p className="text-sm font-medium">
            {selectedIds.length} customer(s) selected
          </p>
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
            Customers without sales will be permanently deleted. Customers with
            existing sales will be retained to protect transaction history.
          </p>
        </div>

        {role === "STAFF" && (
          <div className="space-y-2">
            <label
              htmlFor="customer-admin-password"
              className="flex items-center gap-2 text-sm font-medium"
            >
              <ShieldCheck className="size-4 text-primary" />
              Administrator Authorization
            </label>
            <p className="text-xs text-muted-foreground">
              Enter the password of an active administrator to authorize this
              operation.
            </p>
            <input
              id="customer-admin-password"
              type="password"
              autoComplete="off"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Administrator password"
              disabled={pending}
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            />
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
          >
            {error}
          </p>
        )}
      </ConfirmationDialog>

      {/* Bulk deletion results */}
      {result && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]"
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-result-title"
            className="flex max-h-[85dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-border/70 px-5 py-4">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {result.blocked.length === 0 ? (
                  <CheckCircle2 className="size-5" />
                ) : (
                  <Info className="size-5" />
                )}
              </div>

              <div>
                <h2
                  id="delete-result-title"
                  className="text-base font-semibold"
                >
                  Deletion Results
                </h2>

                <p className="text-xs text-muted-foreground">
                  Customer deletion operation completed
                </p>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <p className="text-xs text-muted-foreground">Deleted</p>
                  <p className="mt-1 text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
                    {result.deletedCount}
                  </p>
                </div>

                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                  <p className="text-xs text-muted-foreground">Retained</p>
                  <p className="mt-1 text-2xl font-semibold text-amber-600 dark:text-amber-400">
                    {result.blocked.length}
                  </p>
                </div>
              </div>

              {result.blocked.length > 0 ? (
                <>
                  <p className="text-sm font-medium">
                    The following customers were retained because they have
                    existing sales:
                  </p>

                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-3 py-2 text-xs font-medium">
                            Customer
                          </th>
                          <th className="px-3 py-2 text-xs font-medium">
                            Bill Number
                          </th>
                          <th className="px-3 py-2 text-xs font-medium">
                            Status
                          </th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-border">
                        {result.blocked.flatMap((customer) =>
                          customer.sales.map((sale) => (
                            <tr key={`${customer.id}-${sale.billNumber}`}>
                              <td className="px-3 py-2">{customer.name}</td>

                              <td className="px-3 py-2 font-mono text-xs">
                                {sale.billNumber}
                              </td>

                              <td className="px-3 py-2">
                                {sale.status.replaceAll("_", " ")}
                              </td>
                            </tr>
                          )),
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  All eligible customers were successfully deleted.
                </p>
              )}
            </div>

            <div className="flex justify-end border-t border-border/70 px-5 py-4">
              <button
                type="button"
                onClick={closeResult}
                className="h-9 cursor-pointer rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer View/Edit modal */}
      {customerModal && (
        <CustomerDetailsModal
          key={`${customerModal.customerId}-${customerModal.mode}`}
          customerId={customerModal.customerId}
          mode={customerModal.mode}
          role={role}
          onClose={closeCustomerModal}
        />
      )}
    </>
  );
}
