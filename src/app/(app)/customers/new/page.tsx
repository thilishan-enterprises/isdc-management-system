"use client";

import { useActionState, useRef, useState } from "react";
import {
  createCustomer,
  type CustomerRegistrationField,
  type CustomerRegistrationState,
} from "../actions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AppInput } from "@/components/common/app-input";
import { AppTextarea } from "@/components/common/app-textarea";
import { FormField } from "@/components/common/form-field";
import { FormSectionTitle } from "@/components/common/form-section-title";
import { ConfirmationDialog } from "@/components/common/confirmation-dialog";
import { UnsavedChangesLink } from "@/components/common/unsaved-changes-guard";
import {
  useFormDirtyState,
  useUnsavedChanges,
} from "@/hooks/use-unsaved-changes";
import {
  ADDITIONAL_MOBILE_ERROR,
  NIC_ERROR,
  PRIMARY_MOBILE_ERROR,
} from "@/lib/customer-contact";
import {
  ArrowLeft,
  LoaderCircle,
  RotateCcw,
  Save,
  UserRound,
} from "lucide-react";

const initialState: CustomerRegistrationState = {};
const initialValues: Record<CustomerRegistrationField, string> = {
  fullName: "",
  nic: "",
  mobile: "",
  additionalMobile: "",
  address: "",
  area: "",
  guarantorDetails: "",
  notes: "",
};

export default function NewCustomerPage() {
  const [formKey, setFormKey] = useState(0);

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <UnsavedChangesLink
          href="/customers"
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted"
        >
          <ArrowLeft className="size-4" />
          Go Back
        </UnsavedChangesLink>

        <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 bg-muted/30 px-2.5 text-xs text-muted-foreground">
          <UserRound className="size-3.5" aria-hidden="true" />
          Customer record only
        </span>
      </div>

      <CustomerRegistrationForm
        key={formKey}
        onReset={() => setFormKey((current) => current + 1)}
      />
    </div>
  );
}

function CustomerRegistrationForm({ onReset }: { onReset: () => void }) {
  const [values, setValues] = useState(initialValues);
  const isDirty = useFormDirtyState(initialValues, values);
  useUnsavedChanges(isDirty, { onDiscard: onReset });
  const [correctedFields, setCorrectedFields] = useState<
    Set<CustomerRegistrationField>
  >(new Set());
  const [hideFormError, setHideFormError] = useState(false);
  const [clientErrors, setClientErrors] = useState<
    Partial<Record<CustomerRegistrationField, string>>
  >({});
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    createCustomer,
    initialState,
  );

  function fieldError(field: CustomerRegistrationField) {
    if (clientErrors[field]) return clientErrors[field];
    return correctedFields.has(field) ? undefined : state.fieldErrors?.[field];
  }

  function updateValue(field: CustomerRegistrationField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setClientErrors((current) => {
      if (!current[field]) return current;

      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function handleReset() {
    if (pending) return;

    if (isDirty) {
      setResetDialogOpen(true);
      return;
    }

    performReset();
  }

  function performReset() {
    formRef.current?.reset();
    setResetDialogOpen(false);
    onReset();
  }

  return (
    <>
      <form
        ref={formRef}
        action={formAction}
        className="space-y-4"
        onSubmit={(event) => {
          if (
            values.additionalMobile &&
            values.additionalMobile === values.mobile
          ) {
            event.preventDefault();
            setClientErrors((current) => ({
              ...current,
              additionalMobile:
                "Primary and additional mobile numbers must be different.",
            }));
            return;
          }

          setCorrectedFields(new Set());
          setHideFormError(false);
        }}
        onInput={(event) => {
          setHideFormError(true);

          const fieldName = (event.target as HTMLInputElement).name;
          if (fieldName) {
            setCorrectedFields((current) => {
              const next = new Set(current);
              next.add(fieldName as CustomerRegistrationField);
              return next;
            });
          }
        }}
      >
        <Card className="border-border/70 shadow-sm">
          <CardContent className="space-y-5 p-4 sm:p-5">
            <FormSectionTitle
              icon={UserRound}
              title="Customer Information"
              description="Enter the customer's personal, contact and additional details."
            />

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <FormField
                label="Customer Name"
                htmlFor="fullName"
                required
                error={fieldError("fullName")}
              >
                <AppInput
                  id="fullName"
                  name="fullName"
                  placeholder="Full name as on NIC"
                  minLength={2}
                  maxLength={150}
                  autoComplete="name"
                  value={values.fullName}
                  onChange={(event) =>
                    updateValue("fullName", event.target.value)
                  }
                  required
                  aria-invalid={Boolean(fieldError("fullName"))}
                />
              </FormField>

              <FormField
                label="NIC Number"
                htmlFor="nic"
                required
                error={fieldError("nic")}
              >
                <AppInput
                  id="nic"
                  name="nic"
                  placeholder="9 or 12 digit NIC number"
                  minLength={9}
                  maxLength={12}
                  pattern="(?:[0-9]{9}|[0-9]{12})"
                  inputMode="numeric"
                  autoComplete="off"
                  value={values.nic}
                  onChange={(event) =>
                    updateValue(
                      "nic",
                      event.target.value.replace(/\D/g, "").slice(0, 12),
                    )
                  }
                  onInvalid={(event) => {
                    event.preventDefault();
                    setClientErrors((current) => ({
                      ...current,
                      nic: NIC_ERROR,
                    }));
                  }}
                  required
                  aria-invalid={Boolean(fieldError("nic"))}
                />
              </FormField>

              <FormField
                label="Primary Mobile"
                htmlFor="mobile"
                required
                error={fieldError("mobile")}
              >
                <AppInput
                  id="mobile"
                  name="mobile"
                  type="tel"
                  inputMode="numeric"
                  pattern="(?:070|071|072|074|075|076|077|078)[0-9]{7}"
                  placeholder="Main contact number"
                  minLength={10}
                  maxLength={10}
                  autoComplete="tel"
                  value={values.mobile}
                  onChange={(event) =>
                    updateValue(
                      "mobile",
                      event.target.value.replace(/\D/g, "").slice(0, 10),
                    )
                  }
                  onInvalid={(event) => {
                    event.preventDefault();
                    setClientErrors((current) => ({
                      ...current,
                      mobile: PRIMARY_MOBILE_ERROR,
                    }));
                  }}
                  required
                  aria-invalid={Boolean(fieldError("mobile"))}
                />
              </FormField>

              <FormField
                label="Additional Mobile"
                htmlFor="additionalMobile"
                error={fieldError("additionalMobile")}
              >
                <AppInput
                  id="additionalMobile"
                  name="additionalMobile"
                  type="tel"
                  inputMode="numeric"
                  pattern="(?:(?:070|071|072|074|075|076|077|078)[0-9]{7}|[0-9]{11,15})"
                  placeholder="Alternative number"
                  minLength={10}
                  maxLength={15}
                  autoComplete="tel"
                  value={values.additionalMobile}
                  onChange={(event) =>
                    updateValue(
                      "additionalMobile",
                      event.target.value.replace(/\D/g, "").slice(0, 15),
                    )
                  }
                  onInvalid={(event) => {
                    event.preventDefault();
                    setClientErrors((current) => ({
                      ...current,
                      additionalMobile: ADDITIONAL_MOBILE_ERROR,
                    }));
                  }}
                  aria-invalid={Boolean(fieldError("additionalMobile"))}
                />
              </FormField>

              <FormField
                label="Address"
                htmlFor="address"
                required
                error={fieldError("address")}
              >
                <AppInput
                  id="address"
                  name="address"
                  placeholder="Residential address"
                  minLength={3}
                  maxLength={500}
                  autoComplete="street-address"
                  value={values.address}
                  onChange={(event) =>
                    updateValue("address", event.target.value)
                  }
                  required
                  aria-invalid={Boolean(fieldError("address"))}
                />
              </FormField>

              <FormField
                label="Collection Area"
                htmlFor="area"
                error={fieldError("area")}
              >
                <AppInput
                  id="area"
                  name="area"
                  placeholder="Town or collection route"
                  maxLength={150}
                  value={values.area}
                  onChange={(event) => updateValue("area", event.target.value)}
                  aria-invalid={Boolean(fieldError("area"))}
                />
              </FormField>

              <div className="sm:col-span-2 lg:col-span-3">
                <FormField
                  label="Guarantor Contact Details"
                  htmlFor="guarantorDetails"
                  error={fieldError("guarantorDetails")}
                >
                  <AppTextarea
                    id="guarantorDetails"
                    name="guarantorDetails"
                    rows={2}
                    maxLength={2000}
                    placeholder="Name, mobile number and address (optional)"
                    value={values.guarantorDetails}
                    onChange={(event) =>
                      updateValue("guarantorDetails", event.target.value)
                    }
                    aria-invalid={Boolean(fieldError("guarantorDetails"))}
                  />
                </FormField>
              </div>

              <div className="sm:col-span-2 lg:col-span-3">
                <FormField
                  label="Additional Notes"
                  htmlFor="notes"
                  error={fieldError("notes")}
                >
                  <AppTextarea
                    id="notes"
                    name="notes"
                    rows={2}
                    maxLength={2000}
                    placeholder="Optional notes or useful information about the customer"
                    value={values.notes}
                    onChange={(event) =>
                      updateValue("notes", event.target.value)
                    }
                    aria-invalid={Boolean(fieldError("notes"))}
                  />
                </FormField>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-4 py-3 shadow-sm sm:px-5">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              Fields marked with * are required. No sale or installment record
              will be created.
            </p>
            {state.formError && !hideFormError && (
              <p
                className="mt-1 text-sm text-destructive"
                role="alert"
                aria-live="polite"
              >
                {state.formError}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <UnsavedChangesLink
              href="/customers"
              className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
            >
              Cancel
            </UnsavedChangesLink>

            <Button
              type="button"
              variant="outline"
              className="h-9 gap-2"
              disabled={pending}
              onClick={handleReset}
            >
              <RotateCcw className="size-4" />
              Reset
            </Button>

            <Button
              type="submit"
              className="h-9 gap-2 font-semibold"
              disabled={pending}
            >
              {pending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              {pending ? "Registering..." : "Register Customer"}
            </Button>
          </div>
        </div>
      </form>

      <ConfirmationDialog
        open={resetDialogOpen}
        title="Reset Customer Form?"
        description="All entered customer information will be cleared. This action cannot be undone."
        confirmLabel="Reset Form"
        cancelLabel="Cancel"
        pending={pending}
        onCancel={() => setResetDialogOpen(false)}
        onConfirm={performReset}
      />
    </>
  );
}
