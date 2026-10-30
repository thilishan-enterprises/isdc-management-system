import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { CustomerSearch } from "./customer-search";

type CustomersPageProps = {
  searchParams: Promise<{
    created?: string;
    error?: string;
  }>;
};

function CustomersFallback() {
  return (
    <div className="space-y-4" role="status">
      <div className="h-8 w-48 animate-pulse rounded bg-muted" />
      <div className="h-64 animate-pulse rounded-xl bg-muted" />
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
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="Customers"
        description="View and search customer records for installment sales and daily collections."
        actions={
          <Link
            href="/customers/register"
            className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
          >
            + New Customer
          </Link>
        }
      />

      {params.created === "1" ? (
        <div
          className="rounded-lg border border-green-600/30 bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-400"
          role="status"
        >
          Customer registered successfully.
        </div>
      ) : null}

      {params.error && errorMessages[params.error] ? (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {errorMessages[params.error]}
        </div>
      ) : null}

      <Card>
        <CardContent className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Customer directory</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {customers.length} registered{" "}
              {customers.length === 1 ? "customer" : "customers"}
            </p>
          </div>

          <CustomerSearch customers={customers} />
        </CardContent>
      </Card>
    </div>
  );
}
