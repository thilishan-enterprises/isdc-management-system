"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  UserRound,
  Pencil,
  ShieldCheck,
  Loader2,
  Save,
  IdCard,
  Phone,
  FileText,
  CalendarDays,
  ShoppingBag,
  Clock3,
  Info,
} from "lucide-react";
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

type FieldConfig = {
  key: EditableField;
  label: string;
  required?: boolean;
  multiline?: boolean;
  maxLength?: number;
  rows?: number;
};

const personalFields: FieldConfig[] = [
  {
    key: "fullName",
    label: "Full Name",
    required: true,
    maxLength: 150,
  },
  {
    key: "nic",
    label: "NIC Number",
    required: true,
    maxLength: 12,
  },
];

const contactFields: FieldConfig[] = [
  {
    key: "mobile",
    label: "Primary Mobile",
    required: true,
    maxLength: 10,
  },
  {
    key: "additionalMobile",
    label: "Additional Mobile",
    maxLength: 15,
  },
  {
    key: "area",
    label: "Collection Area",
    maxLength: 150,
  },
  {
    key: "address",
    label: "Address",
    required: true,
    multiline: true,
    maxLength: 500,
    rows: 2,
  },
];

const additionalFields: FieldConfig[] = [
  {
    key: "guarantorDetails",
    label: "Guarantor Details",
    multiline: true,
    maxLength: 2000,
    rows: 3,
  },
  {
    key: "notes",
    label: "Notes",
    multiline: true,
    maxLength: 2000,
    rows: 3,
  },
];

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Colombo",
  }).format(date);
}

function getInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);

  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

type SectionHeaderProps = {
  icon: typeof UserRound;
  title: string;
  description?: string;
};

function SectionHeader({ icon: Icon, title, description }: SectionHeaderProps) {
  return (
    <div className="mb-4 flex items-center gap-2.5">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/50 text-muted-foreground">
        <Icon className="size-4" />
      </div>

      <div className="min-w-0">
        <h3 className="text-sm font-semibold">{title}</h3>

        {description && (
          <p className="text-[11px] text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
  );
}

type CustomerFieldProps = {
  field: FieldConfig;
  mode: "view" | "edit";
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
};

function CustomerField({
  field,
  mode,
  value,
  disabled,
  onChange,
}: CustomerFieldProps) {
  const inputId = `customer-${field.key}`;

  return (
    <div
      className={[
        "min-w-0 space-y-1.5",
        field.multiline ? "sm:col-span-2" : "",
      ].join(" ")}
    >
      <label
        htmlFor={mode === "edit" ? inputId : undefined}
        className="block text-xs font-medium text-muted-foreground"
      >
        {field.label}

        {field.required && mode === "edit" && (
          <span className="ml-1 text-destructive">*</span>
        )}
      </label>

      {mode === "view" ? (
        <div
          className={[
            "min-h-10 whitespace-pre-wrap break-words rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 text-sm",
            !value.trim() ? "text-muted-foreground" : "text-foreground",
          ].join(" ")}
        >
          {value.trim() || "—"}
        </div>
      ) : field.multiline ? (
        <textarea
          id={inputId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          required={field.required}
          rows={field.rows ?? 3}
          maxLength={field.maxLength}
          className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
      ) : (
        <input
          id={inputId}
          type={
            field.key === "mobile" || field.key === "additionalMobile"
              ? "tel"
              : "text"
          }
          value={value}
          onChange={(event) =>
            onChange(
              field.key === "nic"
                ? event.target.value.replace(/\D/g, "").slice(0, 12)
                : field.key === "mobile"
                  ? event.target.value.replace(/\D/g, "").slice(0, 10)
                  : field.key === "additionalMobile"
                    ? event.target.value.replace(/\D/g, "").slice(0, 15)
                    : event.target.value,
            )
          }
          disabled={disabled}
          required={field.required}
          maxLength={field.maxLength}
          inputMode={
            field.key === "nic" ||
            field.key === "mobile" ||
            field.key === "additionalMobile"
              ? "numeric"
              : undefined
          }
          pattern={
            field.key === "nic"
              ? "(?:[0-9]{9}|[0-9]{12})"
              : field.key === "mobile"
                ? "(?:070|071|072|074|075|076|077|078)[0-9]{7}"
                : field.key === "additionalMobile"
                  ? "(?:(?:070|071|072|074|075|076|077|078)[0-9]{7}|[0-9]{11,15})"
                  : undefined
          }
          className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
      )}
    </div>
  );
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

    const requiredFields: EditableField[] = [
      "fullName",
      "nic",
      "mobile",
      "address",
    ];

    const missingRequired = requiredFields.some((key) => !form[key].trim());

    if (missingRequired) {
      notify.warning("Required information missing", {
        description: "Please complete all required customer fields.",
      });
      return;
    }

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

  function renderFields(fields: FieldConfig[]) {
    if (!form) return null;

    return fields.map((field) => (
      <CustomerField
        key={field.key}
        field={field}
        mode={mode}
        value={form[field.key] ?? ""}
        disabled={pending}
        onChange={(value) => updateField(field.key, value)}
      />
    ));
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-3 backdrop-blur-[2px] sm:p-5"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-modal-title"
        className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 bg-muted/15 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              {mode === "view" ? (
                <UserRound className="size-5" />
              ) : (
                <Pencil className="size-5" />
              )}
            </div>

            <div className="min-w-0">
              <h2
                id="customer-modal-title"
                className="text-base font-semibold tracking-tight"
              >
                {mode === "view" ? "Customer Details" : "Edit Customer"}
              </h2>

              <p className="text-xs text-muted-foreground">
                {mode === "view"
                  ? "Customer profile and registration information"
                  : "Update customer information"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label="Close customer dialog"
            className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {loading ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="size-6 animate-spin text-primary" />

              <p className="text-sm">Loading customer details...</p>
            </div>
          ) : customer && form ? (
            <div className="space-y-6">
              {/* Profile summary */}
              <div className="rounded-xl border border-border/70 bg-muted/20 p-4 sm:p-5">
                <div className="flex flex-wrap items-start gap-4">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-base font-semibold text-primary">
                    {getInitials(customer.fullName) || "C"}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="break-words text-base font-semibold tracking-tight">
                      {customer.fullName}
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      NIC: {customer.nic}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="size-3.5" />
                        Registered {formatDate(customer.createdAt)}
                      </span>

                      <span className="inline-flex items-center gap-1.5">
                        <Clock3 className="size-3.5" />
                        Updated {formatDate(customer.updatedAt)}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-lg border border-primary/15 bg-primary/5 px-3 py-2 text-center">
                    <div className="flex items-center justify-center gap-1.5 text-primary">
                      <ShoppingBag className="size-3.5" />

                      <span className="text-lg font-semibold tabular-nums">
                        {customer.totalSales}
                      </span>
                    </div>

                    <p className="text-[10px] font-medium text-muted-foreground">
                      Total Sales
                    </p>
                  </div>
                </div>
              </div>

              {/* Personal information */}
              <section>
                <SectionHeader
                  icon={IdCard}
                  title="Personal Information"
                  description="Customer identity details"
                />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {renderFields(personalFields)}
                </div>
              </section>

              <div className="border-t border-border/60" />

              {/* Contact information */}
              <section>
                <SectionHeader
                  icon={Phone}
                  title="Contact & Collection"
                  description="Phone numbers, address and collection area"
                />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {renderFields(contactFields)}
                </div>
              </section>

              <div className="border-t border-border/60" />

              {/* Additional information */}
              <section>
                <SectionHeader
                  icon={FileText}
                  title="Additional Information"
                  description="Guarantor information and internal notes"
                />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {renderFields(additionalFields)}
                </div>
              </section>

              {/* Administrator authorization */}
              {mode === "edit" && role === "STAFF" && (
                <>
                  <div className="border-t border-border/60" />

                  <section className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                    <div className="mb-3 flex items-start gap-2.5">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400">
                        <ShieldCheck className="size-4" />
                      </div>

                      <div>
                        <h3 className="text-sm font-semibold">
                          Administrator Authorization
                        </h3>

                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          An active administrator must authorize changes made by
                          staff members.
                        </p>
                      </div>
                    </div>

                    <label
                      htmlFor="customer-edit-admin-password"
                      className="mb-1.5 block text-xs font-medium"
                    >
                      Administrator Password
                    </label>

                    <input
                      id="customer-edit-admin-password"
                      type="password"
                      autoComplete="off"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      disabled={pending}
                      placeholder="Enter administrator password"
                      className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    />
                  </section>
                </>
              )}
            </div>
          ) : (
            <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-center">
              <div className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Info className="size-5" />
              </div>

              <p className="text-sm font-medium">
                Customer information unavailable
              </p>

              <p className="text-xs text-muted-foreground">
                The customer may no longer exist or you may not have permission
                to view this record.
              </p>
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
            >
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/70 bg-muted/10 px-5 py-4 sm:px-6">
          <p className="hidden text-xs text-muted-foreground sm:block">
            {mode === "view"
              ? "Customer information is read-only"
              : "Fields marked * are required"}
          </p>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="h-9 cursor-pointer rounded-lg border border-input bg-background px-4 text-sm font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
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
    </div>
  );
}
