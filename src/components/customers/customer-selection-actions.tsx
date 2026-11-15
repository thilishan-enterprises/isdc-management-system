"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Eye,
  Pencil,
  Trash2,
  X,
  ShieldCheck,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import {
  deleteCustomers,
  type DeleteCustomersResult,
} from "@/app/(app)/customers/management-actions";
import { CustomerDetailsModal } from "@/components/customers/customer-details-modal";
import { notify } from "@/lib/notify";

type Props = {
  selectedIds: string[];
  role: "ADMIN" | "STAFF";
  onClear: () => void;
};

type PendingAction = "edit" | "delete" | null;

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

  function openAction(nextAction: "edit" | "delete") {
    setError("");
    setPassword("");
    setAction(nextAction);
  }

  function handleView() {
    if (!singleSelected) return;

    setCustomerModal({
      customerId: selectedIds[0],
      mode: "view",
    });
  }

  function handleEdit() {
    if (!singleSelected) return;

    setCustomerModal({
      customerId: selectedIds[0],
      mode: "edit",
    });
  }

  function handleDelete() {
    if (pending) return;

    setError("");

    startTransition(async () => {
      try {
        const response = await deleteCustomers({
          customerIds: selectedIds,
          adminPassword: role === "STAFF" ? password : undefined,
        });

        if (!response.success) {
          notify.error("Customer deletion failed", {
            description: response.error ?? "Unable to delete customers.",
          });
          return;
        }

        if (response.blocked.length === 0) {
          notify.success("Customers deleted successfully", {
            description: `${response.deletedCount} customer(s) permanently deleted.`,
          });
        } else {
          notify.warning("Customer deletion completed", {
            description: `${response.deletedCount} deleted, ${response.blocked.length} retained due to existing sales.`,
          });
        }

        setResult(response);
        setAction(null);
        setPassword("");
        router.refresh();
      } catch {
        setError("An unexpected error occurred. Please try again.");
      }
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={!singleSelected || pending}
          onClick={handleView}
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-input bg-background px-3 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Eye className="size-3.5" />
          View
        </button>

        <button
          type="button"
          disabled={!singleSelected || pending}
          onClick={handleEdit}
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-input bg-background px-3 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Pencil className="size-3.5" />
          Edit
        </button>

        <button
          type="button"
          disabled={pending}
          onClick={() => openAction("delete")}
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-destructive/30 bg-background px-3 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-40"
        >
          <Trash2 className="size-3.5" />
          Delete
        </button>
      </div>

      {action === "delete" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeDialog();
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-customers-title"
            className="w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-5 text-destructive" />
                <h2
                  id="delete-customers-title"
                  className="text-base font-semibold"
                >
                  Confirm Customer Deletion
                </h2>
              </div>

              <button
                type="button"
                onClick={closeDialog}
                disabled={pending}
                aria-label="Close dialog"
                className="cursor-pointer rounded-md p-1 hover:bg-muted disabled:opacity-40"
              >
                <X className="size-4" />
              </button>
            </div>

            <p className="mt-3 text-sm text-muted-foreground">
              You selected{" "}
              <strong className="text-foreground">{selectedIds.length}</strong>{" "}
              customer(s).
            </p>

            <p className="mt-2 text-sm text-muted-foreground">
              Customers with existing sales will be retained. Others will be
              permanently deleted.
            </p>

            {role === "STAFF" && (
              <div className="mt-4 space-y-2">
                <label
                  htmlFor="customer-admin-password"
                  className="flex items-center gap-2 text-sm font-medium"
                >
                  <ShieldCheck className="size-4" />
                  Administrator Password
                </label>

                <input
                  id="customer-admin-password"
                  type="password"
                  autoComplete="off"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter admin password"
                  disabled={pending}
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            )}

            {error && (
              <p
                role="alert"
                className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeDialog}
                disabled={pending}
                className="h-9 cursor-pointer rounded-lg border border-input px-4 text-sm font-medium hover:bg-muted disabled:opacity-40"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleDelete}
                disabled={pending || (role === "STAFF" && !password)}
                className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-destructive/30 bg-background px-4 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-40 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pending && <Loader2 className="size-4 animate-spin" />}
                {pending ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-result-title"
            className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl"
          >
            <div className="border-b border-border px-5 py-4">
              <h2 id="delete-result-title" className="text-base font-semibold">
                Bulk Deletion Results
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Customer deletion has finished.
              </p>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-emerald-500/10 p-4">
                  <p className="text-xs text-muted-foreground">Deleted</p>
                  <p className="mt-1 text-2xl font-semibold text-emerald-600">
                    {result.deletedCount}
                  </p>
                </div>

                <div className="rounded-lg bg-amber-500/10 p-4">
                  <p className="text-xs text-muted-foreground">Retained</p>
                  <p className="mt-1 text-2xl font-semibold text-amber-600">
                    {result.blocked.length}
                  </p>
                </div>
              </div>

              {result.blocked.length > 0 && (
                <>
                  <p className="text-sm font-medium">
                    These customers were retained because they have existing
                    sales:
                  </p>

                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-3 py-2">Customer</th>
                          <th className="px-3 py-2">Bill ID</th>
                          <th className="px-3 py-2">Status</th>
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
              )}

              {result.blocked.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No customers were blocked by existing sales.
                </p>
              )}
            </div>

            <div className="flex justify-end border-t border-border p-4">
              <button
                type="button"
                onClick={() => {
                  setResult(null);
                  onClear();
                }}
                className="h-9 cursor-pointer rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
      {customerModal && (
        <CustomerDetailsModal
          customerId={customerModal.customerId}
          mode={customerModal.mode}
          role={role}
          onClose={() => setCustomerModal(null)}
        />
      )}
    </>
  );
}
