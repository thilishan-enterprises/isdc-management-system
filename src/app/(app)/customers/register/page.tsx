import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerForm } from "../customer-form";

type PageProps = {
  searchParams: Promise<{
    created?: string;
    error?: string;
  }>;
};

function PageFallback() {
  return (
    <div className="space-y-4" role="status">
      <div className="h-8 w-64 animate-pulse rounded bg-muted" />
      <div className="h-96 animate-pulse rounded-xl bg-muted" />
      <span className="sr-only">Loading sale registration...</span>
    </div>
  );
}

function formatLKR(value: number) {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-LK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Colombo",
  }).format(date);
}

function getTodayInSriLanka() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

const errorMessages: Record<string, string> = {
  invalid: "Please check the required fields and enter valid details.",
  amount: "The advance payment cannot exceed the total sale amount.",
  installment: "Please enter a valid monthly installment amount and schedule.",
  duplicate: "That bill number is already registered.",
  "customer-conflict":
    "The NIC and mobile number belong to conflicting customer records. Check the customer details before proceeding.",
  product:
    "The selected product is no longer available. Please select another product.",
  "product-brand-required": "Please select a brand for this product.",
  "product-brand":
    "The selected brand is no longer available. Please select another brand.",
  stock:
    "There is not enough stock available for the selected brand and quantity.",
  employee:
    "The selected employee is no longer active. Please select another employee.",
  failed: "The sale could not be registered. Please try again.",
};

export default function RegisterSalePage({ searchParams }: PageProps) {
  return (
    <Suspense fallback={<PageFallback />}>
      <RegisterSaleContent searchParams={searchParams} />
    </Suspense>
  );
}

async function RegisterSaleContent({ searchParams }: PageProps) {
  const params = await searchParams;

  const [products, employees, recentSales] = await Promise.all([
    prisma.product.findMany({
      where: {
        isActive: true,
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        price: true,
        stockQuantity: true,
        warrantyMonths: true,
        productBrands: {
          where: { isActive: true },
          orderBy: { brand: { name: "asc" } },
          select: {
            id: true,
            brandId: true,
            price: true,
            stockQuantity: true,
            warrantyMonths: true,
            brand: {
              select: { name: true },
            },
          },
        },
      },
    }),

    prisma.employee.findMany({
      where: { isActive: true },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),

    prisma.sale.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        billNumber: true,
        saleDate: true,
        totalAmount: true,
        advancePayment: true,
        status: true,
        notes: true,

        customer: {
          select: {
            fullName: true,
            nic: true,
            mobile: true,
            additionalMobile: true,
            address: true,
            area: true,
            guarantorDetails: true,
          },
        },

        salesEmployee: {
          select: {
            fullName: true,
            mobile: true,
          },
        },

        items: {
          select: {
            productName: true,
            quantity: true,
            unitPrice: true,
            lineTotal: true,
            productBrand: {
              select: {
                brand: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },

        installments: {
          orderBy: {
            installmentNumber: "asc",
          },
          select: {
            installmentNumber: true,
            dueDate: true,
            scheduledAmount: true,
          },
        },
      },
    }),
  ]);

  const serializedProducts = products.map((product) => ({
    id: product.id,
    name: product.name,
    price: String(product.price),
    stockQuantity: product.stockQuantity,
    warrantyMonths: product.warrantyMonths,
    productBrands: product.productBrands.map((option) => ({
      id: option.id,
      brandId: option.brandId,
      brandName: option.brand.name,
      price: String(option.price),
      stockQuantity: option.stockQuantity,
      warrantyMonths: option.warrantyMonths,
    })),
  }));

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="New Sale Registration"
        description="Register a customer purchase and set up its installment collection plan."
        actions={
          <Link
            href="/customers"
            className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium transition-colors hover:bg-muted"
          >
            Go Back
          </Link>
        }
      />

      {params.created === "1" && (
        <div
          className="rounded-lg border border-green-600/30 bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-400"
          role="status"
        >
          Sale registered successfully.
        </div>
      )}

      {params.error && errorMessages[params.error] && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {errorMessages[params.error]}
        </div>
      )}

      <CustomerForm
        products={serializedProducts}
        employees={employees}
        today={getTodayInSriLanka()}
      />

      <Card>
        <CardHeader>
          <CardTitle>Recent sales</CardTitle>
          <p className="text-sm text-muted-foreground">
            The 10 most recently created sales, including their customer and
            payment details.
          </p>
        </CardHeader>

        <CardContent>
          {recentSales.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <p className="font-medium">No sales registered yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Your latest sale registrations will appear here.
              </p>
            </div>
          ) : (
            <div className="max-h-[500px] overflow-auto rounded-md border">
              <table className="w-full min-w-[2300px] text-left text-sm">
                <thead>
                  <tr className="border-b bg-muted text-xs text-muted-foreground">
                    <th className="px-3 py-3 font-medium sticky top-0 z-10 bg-muted">
                      Bill Number
                    </th>
                    <th className="px-3 py-3 font-medium sticky top-0 z-10 bg-muted">
                      Client Name & NIC
                    </th>
                    <th className="px-3 py-3 font-medium sticky top-0 z-10 bg-muted">
                      Mobile Numbers
                    </th>
                    <th className="px-3 py-3 font-medium sticky top-0 z-10 bg-muted">
                      Address
                    </th>
                    <th className="px-3 py-3 font-medium sticky top-0 z-10 bg-muted">
                      Guarantor Details
                    </th>
                    <th className="px-3 py-3 font-medium sticky top-0 z-10 bg-muted">
                      Products
                    </th>
                    <th className="px-3 py-3 text-right font-medium sticky top-0 z-10 bg-muted">
                      Total
                    </th>
                    <th className="px-3 py-3 text-right font-medium sticky top-0 z-10 bg-muted">
                      Down-Payment
                    </th>
                    <th className="px-3 py-3 text-right font-medium sticky top-0 z-10 bg-muted">
                      Initial Balance
                    </th>
                    <th className="px-3 py-3 text-right font-medium sticky top-0 z-10 bg-muted">
                      Monthly Installment
                    </th>
                    <th className="px-3 py-3 font-medium sticky top-0 z-10 bg-muted">
                      1st Installment Date
                    </th>
                    <th className="px-3 py-3 font-medium sticky top-0 z-10 bg-muted">
                      Dispatch Date
                    </th>
                    <th className="px-3 py-3 font-medium sticky top-0 z-10 bg-muted">
                      Salesman
                    </th>
                    <th className="px-3 py-3 font-medium sticky top-0 z-10 bg-muted">
                      Notes
                    </th>
                    <th className="px-3 py-3 font-medium sticky top-0 z-10 bg-muted">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recentSales.map((sale) => {
                    const total = Number(sale.totalAmount);
                    const advance = Number(sale.advancePayment);
                    const balance = Math.max(0, total - advance);

                    return (
                      <tr
                        key={sale.id}
                        className="border-b align-top transition-colors hover:bg-muted/40 last:border-0"
                      >
                        {/* Bill number */}
                        <td className="whitespace-nowrap px-3 py-4 font-semibold">
                          {sale.billNumber}
                        </td>

                        {/* Customer name and NIC */}
                        <td className="min-w-30 px-3 py-4">
                          <p className="font-medium">
                            {sale.customer.fullName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            NIC: {sale.customer.nic}
                          </p>
                        </td>

                        {/* Mobile numbers */}
                        <td className="min-w-25 px-3 py-4">
                          <p className="mt-1 text-xs text-muted-foreground">
                            Primary: {sale.customer.mobile}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Secondary: {sale.customer.additionalMobile || "N/A"}
                          </p>
                        </td>

                        {/* Address and area */}
                        <td className="max-w-56 px-3 py-4">
                          <p className="whitespace-pre-wrap break-words">
                            {sale.customer.address}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Area: {sale.customer.area || "N/A"}
                          </p>
                        </td>

                        {/* Guarantor */}
                        <td className="max-w-56 px-3 py-4">
                          <p className="whitespace-pre-wrap break-words text-muted-foreground">
                            {sale.customer.guarantorDetails || "N/A"}
                          </p>
                        </td>

                        {/* Products */}
                        <td className="min-w-30 px-3 py-4">
                          <div className="space-y-3">
                            {sale.items.map((item, index) => (
                              <div key={`${item.productName}-${index}`}>
                                <p className="font-medium">
                                  {item.productBrand?.brand.name
                                    ? `${item.productName} | ${item.productBrand.brand.name}`
                                    : item.productName}{" "}
                                  * {item.quantity}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Unit price:{" "}
                                  {formatLKR(Number(item.unitPrice))}
                                </p>
                              </div>
                            ))}
                          </div>
                        </td>

                        {/* Financial details */}
                        <td className="whitespace-nowrap px-3 py-4 text-right tabular-nums">
                          {formatLKR(total)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-right tabular-nums">
                          {formatLKR(advance)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-right font-medium tabular-nums">
                          {formatLKR(balance)}
                        </td>

                        {/* Installment schedule */}
                        <td className="min-w-25 px-3 py-4 text-right ">
                          {sale.installments.length > 0 ? (
                            <>
                              <p className="font-medium">
                                {formatLKR(
                                  Number(sale.installments[0].scheduledAmount),
                                )}
                              </p>

                              <p className="mt-1 text-xs text-muted-foreground">
                                {sale.installments.length} installment(s)
                              </p>
                            </>
                          ) : (
                            "N/A"
                          )}
                        </td>

                        {/* First installment date */}
                        <td className="whitespace-nowrap px-3 py-4">
                          {formatDate(sale.installments[0].dueDate)}
                        </td>

                        {/* Dispatch date */}
                        <td className="whitespace-nowrap px-3 py-4">
                          {formatDate(sale.saleDate)}
                        </td>

                        {/* Salesman */}
                        <td className="min-w-20 px-3 py-4">
                          {sale.salesEmployee ? (
                            <>
                              <p className="font-medium">
                                {sale.salesEmployee.fullName}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {sale.salesEmployee.mobile ||
                                  "No mobile number"}
                              </p>
                            </>
                          ) : (
                            "N/A"
                          )}
                        </td>

                        {/* Sale notes */}
                        <td className="max-w-56 px-3 py-4">
                          <p className="whitespace-pre-wrap break-words text-muted-foreground">
                            {sale.notes || "N/A"}
                          </p>
                        </td>

                        {/* Status */}
                        <td className="px-3 py-4">
                          <span
                            className={
                              sale.status === "PAID"
                                ? "inline-flex rounded-full bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-700 dark:text-green-400"
                                : sale.status === "CANCELLED"
                                  ? "inline-flex rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive"
                                  : "inline-flex rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-400"
                            }
                          >
                            {sale.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
