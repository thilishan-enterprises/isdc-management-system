import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { WhatsAppPhone } from "@/components/common/whatsapp-phone";
import { SaleForm } from "../_components/sale-form";
import { RecentSalesDetailsControl } from "../_components/recent-sales-details-control";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  FileText,
  ReceiptText,
} from "lucide-react";

type PageProps = {
  searchParams: Promise<{
    created?: string;
    error?: string;
  }>;
};

function PageFallback() {
  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-4" role="status">
      <div className="h-8 w-64 animate-pulse rounded-lg bg-muted" />
      <div className="h-72 animate-pulse rounded-xl bg-muted" />
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

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === "PAID"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : status === "CANCELLED"
        ? "border-destructive/20 bg-destructive/10 text-destructive"
        : "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-400";

  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold ${styles}`}
    >
      {status}
    </span>
  );
}

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
        productBrands: {
          where: { isActive: true },
          orderBy: { brand: { name: "asc" } },
          select: {
            id: true,
            brandId: true,
            price: true,
            stockQuantity: true,
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

        // Immutable customer details captured when this bill was registered.
        customerSnapshot: {
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
    productBrands: product.productBrands.map((option) => ({
      id: option.id,
      brandId: option.brandId,
      brandName: option.brand.name,
      price: String(option.price),
      stockQuantity: option.stockQuantity,
    })),
  }));

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/sales"
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted"
        >
          <ArrowLeft className="size-4" />
          Go Back
        </Link>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <ReceiptText className="size-4" />
          Sale registration
        </span>
      </div>

      {params.created === "1" && (
        <div
          className="flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3.5 py-2.5 text-sm text-emerald-700 dark:text-emerald-400"
          role="status"
        >
          <CheckCircle2 className="size-4 shrink-0" />
          Sale registered successfully.
        </div>
      )}

      {params.error && errorMessages[params.error] && (
        <div
          className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive"
          role="alert"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {errorMessages[params.error]}
        </div>
      )}

      <SaleForm
        products={serializedProducts}
        employees={employees}
        today={getTodayInSriLanka()}
      />

      {/* Recent sales */}
      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardContent className="p-0">
          {recentSales.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-5 py-10 text-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                <FileText className="size-5 text-muted-foreground" />
              </div>
              <p className="mt-3 text-sm font-semibold">
                No sales registered yet
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Your latest sale registrations will appear here.
              </p>
            </div>
          ) : (
            <RecentSalesDetailsControl
              header={
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Clock3 className="size-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold">Recent sales</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Your 10 latest sale registrations.
                    </p>
                  </div>
                </div>
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border/70 bg-muted/35">
                      <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Bill / Customer
                      </th>

                      <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Products
                      </th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Sale total
                      </th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Advance
                      </th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Balance
                      </th>
                      <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Installment plan
                      </th>
                      <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Dispatch date
                      </th>
                      <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Salesman / Status
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-border/60">
                    {recentSales.map((sale) => {
                      const total = Number(sale.totalAmount);
                      const advance = Number(sale.advancePayment);
                      const balance = Math.max(0, total - advance);
                      const firstInstallment = sale.installments[0] ?? null;
                      // Legacy bills may not have a saved snapshot.
                      const customerDetails =
                        sale.customerSnapshot ?? sale.customer;

                      return (
                        <tr
                          key={sale.id}
                          className="align-top transition-colors hover:bg-muted/20"
                        >
                          {/* Bill and customer */}
                          <td className="max-w-[210px] px-4 py-3">
                            <p className="font-semibold">{sale.billNumber}</p>
                            <p className="mt-1 truncate text-xs font-medium text-foreground/85">
                              {customerDetails.fullName}
                            </p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              NIC: {customerDetails.nic}
                            </p>

                            <details className="group mt-2">
                              <summary className="w-fit cursor-pointer list-none text-[11px] font-medium text-primary marker:hidden hover:underline">
                                <span className="group-open:hidden">
                                  More customer details
                                </span>
                                <span className="hidden group-open:inline">
                                  Hide details
                                </span>
                              </summary>

                              <div className="mt-2 space-y-1.5 rounded-md border border-border/70 bg-muted/25 p-2.5 text-[11px] leading-4 text-muted-foreground">
                                <p>
                                  <strong className="text-foreground">
                                    Mobile:
                                  </strong>{" "}
                                  <WhatsAppPhone
                                    phone={customerDetails.mobile}
                                  />
                                </p>
                                <p>
                                  <strong className="text-foreground">
                                    Additional:
                                  </strong>{" "}
                                  <WhatsAppPhone
                                    phone={customerDetails.additionalMobile}
                                    emptyLabel="N/A"
                                  />
                                </p>
                                <p>
                                  <strong className="text-foreground">
                                    Address:
                                  </strong>{" "}
                                  {customerDetails.address}
                                </p>
                                <p>
                                  <strong className="text-foreground">
                                    Area:
                                  </strong>{" "}
                                  {customerDetails.area || "N/A"}
                                </p>
                                <p className="whitespace-pre-wrap break-words">
                                  <strong className="text-foreground">
                                    Guarantor:
                                  </strong>{" "}
                                  {customerDetails.guarantorDetails || "N/A"}
                                </p>
                                <p className="whitespace-pre-wrap break-words">
                                  <strong className="text-foreground">
                                    Notes:
                                  </strong>{" "}
                                  {sale.notes || "N/A"}
                                </p>
                              </div>
                            </details>
                          </td>

                          {/* Products */}
                          <td className="max-w-[230px] px-4 py-3">
                            <div className="space-y-2">
                              {sale.items.map((item, index) => (
                                <div key={`${item.productName}-${index}`}>
                                  <p className="text-xs font-medium leading-5">
                                    {item.productName}
                                    {item.productBrand?.brand.name
                                      ? ` · ${item.productBrand.brand.name}`
                                      : ""}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground">
                                    Qty {item.quantity} ×{" "}
                                    {formatLKR(Number(item.unitPrice))}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </td>

                          {/* Amounts */}
                          <td className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold tabular-nums">
                            {formatLKR(total)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right text-xs tabular-nums text-muted-foreground">
                            {formatLKR(advance)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold tabular-nums">
                            {formatLKR(balance)}
                          </td>

                          {/* Installment plan */}
                          <td className="whitespace-nowrap px-4 py-3">
                            {firstInstallment ? (
                              <>
                                <p className="text-xs font-semibold tabular-nums">
                                  {formatLKR(
                                    Number(firstInstallment.scheduledAmount),
                                  )}
                                </p>
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                  {sale.installments.length} payment(s)
                                </p>
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                  First due:{" "}
                                  {formatDate(firstInstallment.dueDate)}
                                </p>
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                No installments
                              </span>
                            )}
                          </td>

                          {/* Dispatch date */}
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                            {formatDate(sale.saleDate)}
                          </td>

                          {/* Salesman and status */}
                          <td className="px-4 py-3">
                            <p className="mb-2 text-xs font-medium">
                              {sale.salesEmployee?.fullName || "No salesman"}
                            </p>
                            {sale.salesEmployee?.mobile && (
                              <p className="mb-2 text-[11px] text-muted-foreground">
                                <WhatsAppPhone phone={sale.salesEmployee.mobile} />
                              </p>
                            )}
                            <StatusBadge status={sale.status} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </RecentSalesDetailsControl>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
