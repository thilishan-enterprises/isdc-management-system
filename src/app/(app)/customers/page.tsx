import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { CustomerSearch } from "./customer-search";
import { AlertCircle, CheckCircle2, UserPlus } from "lucide-react";

type CustomersPageProps = {
  searchParams: Promise<{
    created?: string;
    error?: string;
  }>;
};

function CustomersFallback() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-5" role="status">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
      <div className="h-12 animate-pulse rounded-xl bg-muted" />
      <div className="h-72 animate-pulse rounded-xl bg-muted" />
      <span className="sr-only">Loading customers...</span>
    </div>
  );
}

export default function CustomersPage({ searchParams }: CustomersPageProps) {
  return (
    <Suspense fallback={<CustomersFallback />}>
      <CustomersContent searchParams={searchParams} />
    </Suspense>
  );
}

async function CustomersContent({ searchParams }: CustomersPageProps) {
  const params = await searchParams;

  const customers = await prisma.customer.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fullName: true,
      nic: true,
      mobile: true,
      address: true,
      area: true,
      createdAt: true,
    },
  });

  const errorMessages: Record<string, string> = {
    invalid: "Please check the customer details and try again.",
    duplicate:
      "A customer with that NIC number or mobile number already exists.",
    failed: "Unable to register the customer. Please try again.",
  };

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-5">
      <PageHeader
        title="Customers"
        description="Manage customer records and contact information."
        actions={
          <Link
            href="/customers/register"
            className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <UserPlus className="size-4" />
            New Customer
          </Link>
        }
      />

      {params.created === "1" && (
        <div
          className="flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3.5 py-2.5 text-sm text-emerald-700 dark:text-emerald-400"
          role="status"
        >
          <CheckCircle2 className="size-4 shrink-0" />
          Customer registered successfully.
        </div>
      )}

      {params.error && errorMessages[params.error] && (
        <div
          className="flex items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive"
          role="alert"
        >
          <AlertCircle className="size-4 shrink-0" />
          {errorMessages[params.error]}
        </div>
      )}

      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <h2 className="text-base font-semibold tracking-tight">
                Customer directory
              </h2>
              <p className="text-sm text-muted-foreground">
                Search and view your registered customers.
              </p>
            </div>

            <div className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border/70 bg-muted/40 px-3 text-xs font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full bg-primary" />
              {customers.length.toLocaleString("en-LK")}{" "}
              {customers.length === 1 ? "customer" : "customers"}
            </div>
          </div>

          <div className="border-t border-border/60 pt-4">
            <CustomerSearch customers={customers} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
