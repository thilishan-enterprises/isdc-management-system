"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, UserRound, Pencil, ShieldCheck, Loader2, Save } from "lucide-react";
import {
  getCustomerDetails,
  updateCustomer,
  type CustomerDetails,
  type CustomerEditInput,
} from "@/app/(app)/customers/management-actions";
import { notify } from "@/lib/notify";

type Props = {
  customerId: string;
  mode: "view" | "edit";
  role: "ADMIN" | "STAFF";
  onClose: () => void;
};

type EditableField = Exclude<keyof CustomerEditInput, "id" | "adminPassword">;

const fields: {
  key: EditableField;
  label: string;
  required?: boolean;
  multiline?: boolean;
}[] = [
  { key: "fullName", label: "Full Name", required: true },
  { key: "nic", label: "NIC Number", required: true },
  { key: "mobile", label: "Primary Mobile", required: true },
  { key: "additionalMobile", label: "Additional Mobile" },
  {
    key: "address",
    label: "Address",
    required: true,
    multiline: true,
  },
  { key: "area", label: "Collection Area" },
  {
    key: "guarantorDetails",
    label: "Guarantor Details",
    multiline: true,
  },
  { key: "notes", label: "Notes", multiline: true },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Colombo",
  }).format(new Date(value));
}

export function CustomerDetailsModal({
  customerId,
  mode,
  role,
  onClose,
}: Props) {
  const router = useRouter();

  const [customer, setCustomer] = useState<CustomerDetails | null>(null);
  const [form, setForm] = useState<CustomerEditInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    getCustomerDetails(customerId)
      .then((data) => {
        if (!active) return;

        setCustomer(data);

        if (data) {
          setForm({
            id: data.id,
            fullName: data.fullName,
            nic: data.nic,
            mobile: data.mobile,
            additionalMobile: data.additionalMobile,
            address: data.address,
            area: data.area,
            guarantorDetails: data.guarantorDetails,
            notes: data.notes,
          });
        } else {
          setError("Customer not found or access denied.");
        }
      })
      .catch(() => {
        if (active) {
          setError("Unable to load customer details.");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [customerId]);

  function updateField(key: EditableField, value: string) {
    setForm((previous) =>
      previous ? { ...previous, [key]: value } : previous,
    );
  }

  function handleSave() {
    if (!form || pending || loading) return;

    if (role === "STAFF" && !password.trim()) {
      notify.warning("Administrator authorization required", {
        description: "Please enter an administrator password to save changes.",
      });
      return;
    }

    setError("");

    startTransition(async () => {
      try {
        const response = await updateCustomer({
          ...form,
          adminPassword: role === "STAFF" ? password : undefined,
        });

        if (!response.success) {
          notify.error("Unable to update customer", {
            description: response.error ?? "Please try again.",
          });
          return;
        }

        notify.success("Customer updated successfully", {
          description: "The customer information has been saved.",
        });

        setPassword("");
        router.refresh();
        onClose();
      } catch {
        notify.error("Something went wrong", {
          description: "Unable to save customer details. Please try again.",
        });
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-3 sm:p-5"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-modal-title"
        className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
      >
        {/* Modal header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {mode === "view" ? (
                <UserRound className="size-5" />
              ) : (
                <Pencil className="size-5" />
              )}
            </div>

            <div>
              <h2 id="customer-modal-title" className="text-base font-semibold">
                {mode === "view" ? "Customer Details" : "Edit Customer"}
              </h2>

              <p className="text-xs text-muted-foreground">
                {mode === "view"
                  ? "View registered customer information"
                  : "Update customer master information"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label="Close"
            className="cursor-pointer rounded-lg p-2 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Modal content */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              Loading customer details...
            </div>
          ) : customer && form ? (
            <div className="space-y-5">
              {/* Customer summary */}
              <div className="rounded-lg border border-border bg-muted/20 p-4">
                <p className="text-base font-semibold">{customer.fullName}</p>

                <p className="mt-1 text-xs text-muted-foreground">
                  Registered {formatDate(customer.createdAt)}
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  Last Updated {formatDate(customer.updatedAt)}
                </p>

                <p className="mt-2 text-xs font-medium text-primary">
                  {customer.totalSales} sale(s) registered
                </p>
              </div>

              {/* Customer fields */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {fields.map((field) => (
                  <div
                    key={field.key}
                    className={field.multiline ? "sm:col-span-2" : ""}
                  >
                    <label
                      htmlFor={`customer-${field.key}`}
                      className="mb-1.5 block text-xs font-medium text-muted-foreground"
                    >
                      {field.label}

                      {field.required && mode === "edit" && (
                        <span className="ml-1 text-destructive">*</span>
                      )}
                    </label>

                    {mode === "view" ? (
                      <div className="min-h-10 whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-sm">
                        {form[field.key] || "—"}
                      </div>
                    ) : field.multiline ? (
                      <textarea
                        id={`customer-${field.key}`}
                        value={form[field.key]}
                        onChange={(event) =>
                          updateField(field.key, event.target.value)
                        }
                        disabled={pending}
                        required={field.required}
                        rows={field.key === "address" ? 2 : 3}
                        maxLength={field.key === "address" ? 500 : 2000}
                        className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                      />
                    ) : (
                      <input
                        id={`customer-${field.key}`}
                        value={form[field.key]}
                        onChange={(event) =>
                          updateField(field.key, event.target.value)
                        }
                        disabled={pending}
                        required={field.required}
                        maxLength={
                          field.key === "fullName" || field.key === "area"
                            ? 150
                            : 20
                        }
                        className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                      />
                    )}
                  </div>
                ))}
              </div>

              {/* Staff administrator authorization */}
              {mode === "edit" && role === "STAFF" && (
                <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-4">
                  <label
                    htmlFor="customer-edit-admin-password"
                    className="mb-2 flex items-center gap-2 text-sm font-medium"
                  >
                    <ShieldCheck className="size-4" />
                    Administrator Authorization
                  </label>

                  <p className="mb-3 text-xs text-muted-foreground">
                    Enter the password of any active administrator to authorize
                    these changes.
                  </p>

                  <input
                    id="customer-edit-admin-password"
                    type="password"
                    autoComplete="off"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={pending}
                    placeholder="Administrator password"
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  />
                </div>
              )}
            </div>
          ) : null}

          {/* Loading / access errors */}
          {error && (
            <p
              role="alert"
              className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          )}
        </div>

        {/* Modal footer */}
        <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="h-9 cursor-pointer rounded-lg border border-input px-4 text-sm font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
          >
            {mode === "view" ? "Close" : "Cancel"}
          </button>

          {mode === "edit" && (
            <button
              type="button"
              onClick={handleSave}
              disabled={
                pending ||
                loading ||
                !form ||
                (role === "STAFF" && !password.trim())
              }
              className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}

              {pending ? "Saving..." : "Save Changes"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
