"use client";

import Link from "next/link";
import { useState } from "react";
import { createCustomer } from "../actions";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AppInput } from "@/components/common/app-input";
import { AppTextarea } from "@/components/common/app-textarea";
import { FormField } from "@/components/common/form-field";
import { FormSectionTitle } from "@/components/common/form-section-title";
import { ArrowLeft, Save, UserRound } from "lucide-react";

export default function NewCustomerPage() {
  const [mobile, setMobile] = useState("");
  const [additionalMobile, setAdditionalMobile] = useState("");
  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-5">
      <PageHeader
        title="New Customer"
        description="Register a new customer and maintain their personal and contact information."
        actions={
          <Link
            href="/customers"
            className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted"
          >
            <ArrowLeft className="size-4" />
            Go Back
          </Link>
        }
      />

      <form action={createCustomer} className="space-y-4">
        <Card className="border-border/70 shadow-sm">
          <CardContent className="space-y-5 p-4 sm:p-5">
            <FormSectionTitle
              icon={UserRound}
              title="Customer Information"
              description="Enter the customer's personal, contact and additional details."
            />

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <FormField label="Customer Name" htmlFor="fullName" required>
                <AppInput
                  id="fullName"
                  name="fullName"
                  placeholder="Full name as on NIC"
                  minLength={2}
                  maxLength={150}
                  autoComplete="name"
                  required
                />
              </FormField>

              <FormField label="NIC Number" htmlFor="nic" required>
                <AppInput
                  id="nic"
                  name="nic"
                  placeholder="NIC number"
                  minLength={10}
                  maxLength={11}
                  autoComplete="off"
                  required
                />
              </FormField>

              <FormField label="Primary Mobile" htmlFor="mobile" required>
                <AppInput
                  id="mobile"
                  name="mobile"
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]{7,10}"
                  placeholder="Main contact number"
                  minLength={7}
                  maxLength={10}
                  autoComplete="tel"
                  value={mobile}
                  onChange={(event) =>
                    setMobile(
                      event.target.value.replace(/\D/g, "").slice(0, 10),
                    )
                  }
                  required
                />
              </FormField>

              <FormField label="Additional Mobile" htmlFor="additionalMobile">
                <AppInput
                  id="additionalMobile"
                  name="additionalMobile"
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]{7,10}"
                  placeholder="Alternative number"
                  minLength={7}
                  maxLength={10}
                  autoComplete="tel"
                  value={additionalMobile}
                  onChange={(event) =>
                    setAdditionalMobile(
                      event.target.value.replace(/\D/g, "").slice(0, 10),
                    )
                  }
                />
              </FormField>

              <FormField label="Address" htmlFor="address" required>
                <AppInput
                  id="address"
                  name="address"
                  placeholder="Residential address"
                  minLength={3}
                  maxLength={500}
                  autoComplete="street-address"
                  required
                />
              </FormField>

              <FormField label="Collection Area" htmlFor="area">
                <AppInput
                  id="area"
                  name="area"
                  placeholder="Town or collection route"
                  maxLength={150}
                />
              </FormField>

              <div className="sm:col-span-2 lg:col-span-3">
                <FormField
                  label="Guarantor Contact Details"
                  htmlFor="guarantorDetails"
                >
                  <AppTextarea
                    id="guarantorDetails"
                    name="guarantorDetails"
                    rows={2}
                    maxLength={2000}
                    placeholder="Name, mobile number and address (optional)"
                  />
                </FormField>
              </div>

              <div className="sm:col-span-2 lg:col-span-3">
                <FormField label="Additional Notes" htmlFor="notes">
                  <AppTextarea
                    id="notes"
                    name="notes"
                    rows={2}
                    maxLength={2000}
                    placeholder="Optional notes or useful information about the customer"
                  />
                </FormField>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-4 py-3 shadow-sm sm:px-5">
          <p className="text-xs text-muted-foreground">
            Fields marked with * are required. No sale or installment record
            will be created.
          </p>

          <div className="flex items-center gap-2">
            <Link
              href="/customers"
              className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
            >
              Cancel
            </Link>

            <Button type="submit" className="gap-2 h-9 font-semibold">
              <Save className="size-4" />
              Register Customer
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
