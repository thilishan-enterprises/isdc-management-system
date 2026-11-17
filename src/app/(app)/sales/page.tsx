import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRow,
} from "@/components/common/data-table";
import { PageStats } from "@/components/common/page-stats";
import {
  Plus,
  ReceiptText,
  Wallet,
  CheckCircle2,
  ShoppingBag,
} from "lucide-react";

type SalesPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    page?: string;
  }>;
};

const PAGE_SIZE = 25;

const STATUS_OPTIONS = [
  "ALL",
  "ACTIVE",
  "PAID",
  "CANCELLED",
  "WRITTEN_OFF",
] as const;

type StatusFilter = (typeof STATUS_OPTIONS)[number];

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

function statusLabel(status: string) {
  switch (status) {
    case "ACTIVE":
      return "Active";
    case "PAID":
      return "Paid";
    case "CANCELLED":
      return "Cancelled";
    case "WRITTEN_OFF":
      return "Written Off";
    default:
      return status;
  }
}

function statusClass(status: string) {
  switch (status) {
    case "ACTIVE":
      return "border-blue-500/20 bg-blue-500/10 text-blue-700";
    case "PAID":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700";
    case "CANCELLED":
      return "border-border bg-muted text-muted-foreground";
    case "WRITTEN_OFF":
      return "border-amber-500/20 bg-amber-500/10 text-amber-700";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function buildSalesUrl(q: string, status: StatusFilter, page: number) {
  const params = new URLSearchParams();

  if (q) params.set("q", q);
  if (status !== "ALL") params.set("status", status);
  if (page > 1) params.set("page", String(page));

  const query = params.toString();

  return `/sales${query ? `?${query}` : ""}`;
}

const columns: DataTableColumn[] = [
  { key: "bill", header: "Bill Number" },
  { key: "customer", header: "Customer" },
  { key: "products", header: "Products" },
  { key: "date", header: "Sale Date" },
  {
    key: "total",
    header: "Sale Amount",
    align: "right",
  },
  {
    key: "advance",
    header: "Advance",
    align: "right",
  },
  {
    key: "collected",
    header: "Collected",
    align: "right",
  },
  {
    key: "outstanding",
    header: "Outstanding",
    align: "right",
  },
  {
    key: "installment",
    header: "Installments",
  },
  { key: "status", header: "Status" },
];

export default async function SalesPage({ searchParams }: SalesPageProps) {
  const params = await searchParams;

  const q = typeof params.q === "string" ? params.q.trim().slice(0, 150) : "";

  const status: StatusFilter = STATUS_OPTIONS.includes(
    params.status as StatusFilter,
  )
    ? (params.status as StatusFilter)
    : "ALL";

  const requestedPage = Number(params.page ?? "1");

  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;

  const where = {
    ...(status !== "ALL" ? { status } : {}),

    ...(q
      ? {
          OR: [
            {
              billNumber: {
                contains: q,
                mode: "insensitive" as const,
              },
            },
            {
              customer: {
                is: {
                  fullName: {
                    contains: q,
                    mode: "insensitive" as const,
                  },
                },
              },
            },
            {
              customer: {
                is: {
                  nic: {
                    contains: q,
                    mode: "insensitive" as const,
                  },
                },
              },
            },
            {
              customer: {
                is: {
                  mobile: {
                    contains: q,
                    mode: "insensitive" as const,
                  },
                },
              },
            },
            {
              customerSnapshot: {
                is: {
                  fullName: {
                    contains: q,
                    mode: "insensitive" as const,
                  },
                },
              },
            },
            {
              customerSnapshot: {
                is: {
                  nic: {
                    contains: q,
                    mode: "insensitive" as const,
                  },
                },
              },
            },
            {
              customerSnapshot: {
                is: {
                  mobile: {
                    contains: q,
                    mode: "insensitive" as const,
                  },
                },
              },
            },
          ],
        }
      : {}),
  };

  const totalRows = await prisma.sale.count({
    where,
  });

  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));

  const currentPage = Math.min(page, totalPages);

  const sales = await prisma.sale.findMany({
    where,
    orderBy: [{ saleDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      billNumber: true,
      saleDate: true,
      totalAmount: true,
      advancePayment: true,
      status: true,

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

      items: {
        select: {
          productName: true,
          quantity: true,
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

      payments: {
        where: {
          status: "POSTED",
        },
        select: {
          amount: true,
        },
      },

      installments: {
        orderBy: {
          installmentNumber: "asc",
        },
        take: 1,
        select: {
          installmentNumber: true,
          dueDate: true,
          scheduledAmount: true,
          allocations: {
            where: {
              payment: {
                status: "POSTED",
              },
            },
            select: {
              amount: true,
            },
          },
        },
      },

      _count: {
        select: {
          installments: true,
        },
      },
    },
  });

  const rows: DataTableRow[] = sales.map((sale) => {
    const customer = sale.customerSnapshot ?? sale.customer;

    const totalAmount = Number(sale.totalAmount);
    const advance = Number(sale.advancePayment);

    const collected = sale.payments.reduce(
      (sum, payment) => sum + Number(payment.amount),
      0,
    );

    const outstanding = Math.max(0, totalAmount - advance - collected);

    const firstInstallment = sale.installments[0] ?? null;

    const firstInstallmentPaid =
      firstInstallment?.allocations.reduce(
        (sum, allocation) => sum + Number(allocation.amount),
        0,
      ) ?? 0;

    return {
      id: sale.id,

      cells: {
        bill: (
          <div className="min-w-[125px]">
            <p className="font-semibold">{sale.billNumber}</p>

            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {sale.items.length} product lines
            </p>
          </div>
        ),

        customer: (
          <div className="min-w-[180px]">
            <p className="font-medium">{customer.fullName}</p>

            <p className="mt-0.5 text-xs text-muted-foreground">
              {customer.nic}
            </p>

            <p className="text-xs text-muted-foreground">{customer.mobile}</p>

            {customer.additionalMobile && (
              <p className="text-xs text-muted-foreground">
                {customer.additionalMobile}
              </p>
            )}

            <details className="mt-1">
              <summary className="cursor-pointer text-[11px] font-medium text-primary">
                More details
              </summary>

              <div className="mt-1 max-w-[250px] space-y-1 text-xs text-muted-foreground">
                <p>{customer.address}</p>

                {customer.area && <p>Area: {customer.area}</p>}

                {customer.guarantorDetails && (
                  <p>Guarantor: {customer.guarantorDetails}</p>
                )}
              </div>
            </details>
          </div>
        ),

        products: (
          <div className="min-w-[170px] space-y-1">
            {sale.items.length === 0 ? (
              <span className="text-muted-foreground">No products</span>
            ) : (
              sale.items.map((item, index) => (
                <p key={index} className="text-xs leading-5">
                  <span className="font-medium">{item.productName}</span>

                  {item.productBrand?.brand.name
                    ? ` - ${item.productBrand.brand.name}`
                    : ""}

                  <span className="text-muted-foreground">
                    {" "}
                    × {item.quantity}
                  </span>
                </p>
              ))
            )}
          </div>
        ),

        date: (
          <span className="whitespace-nowrap text-xs">
            {formatDate(sale.saleDate)}
          </span>
        ),

        total: (
          <span className="whitespace-nowrap font-semibold tabular-nums">
            {formatLKR(totalAmount)}
          </span>
        ),

        advance: (
          <span className="whitespace-nowrap tabular-nums">
            {formatLKR(advance)}
          </span>
        ),

        collected: (
          <span className="whitespace-nowrap font-medium tabular-nums text-emerald-700">
            {formatLKR(collected)}
          </span>
        ),

        outstanding: (
          <span
            className={[
              "whitespace-nowrap font-semibold tabular-nums",
              outstanding > 0 ? "text-amber-700" : "text-emerald-700",
            ].join(" ")}
          >
            {formatLKR(outstanding)}
          </span>
        ),

        installment: (
          <div className="min-w-[150px] space-y-1">
            {firstInstallment ? (
              <>
                <p className="text-xs font-semibold">
                  {formatLKR(Number(firstInstallment.scheduledAmount))}
                </p>

                <p className="text-[11px] text-muted-foreground">
                  First due: {formatDate(firstInstallment.dueDate)}
                </p>

                <p className="text-[11px] text-muted-foreground">
                  {sale._count.installments} scheduled
                </p>

                <p className="text-[11px] text-muted-foreground">
                  First installment paid: {formatLKR(firstInstallmentPaid)}
                </p>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">
                No installments
              </span>
            )}
          </div>
        ),

        status: (
          <span
            className={[
              "inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold",
              statusClass(sale.status),
            ].join(" ")}
          >
            {statusLabel(sale.status)}
          </span>
        ),
      },
    };
  });

  const pageTotal = sales.reduce(
    (sum, sale) => sum + Number(sale.totalAmount),
    0,
  );

  const pageAdvance = sales.reduce(
    (sum, sale) => sum + Number(sale.advancePayment),
    0,
  );

  const pageCollected = sales.reduce(
    (sum, sale) =>
      sum +
      sale.payments.reduce(
        (paymentSum, payment) => paymentSum + Number(payment.amount),
        0,
      ),
    0,
  );

  const pageOutstanding = sales.reduce((sum, sale) => {
    const posted = sale.payments.reduce(
      (paymentSum, payment) => paymentSum + Number(payment.amount),
      0,
    );

    return (
      sum +
      Math.max(
        0,
        Number(sale.totalAmount) - Number(sale.advancePayment) - posted,
      )
    );
  }, 0);

  const summaryCards = [
    {
      label: "Total Sales",
      value: totalRows.toLocaleString("en-LK"),
      icon: ShoppingBag,
    },
    {
      label: "Page Sale Value",
      value: formatLKR(pageTotal),
      icon: ReceiptText,
    },
    {
      label: "Page Collections",
      value: formatLKR(pageAdvance + pageCollected),
      icon: CheckCircle2,
    },
    {
      label: "Page Outstanding",
      value: formatLKR(pageOutstanding),
      icon: Wallet,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-5">
      <PageHeader
        title="Customer Base"
        description="Manage registered sales, customer records, installment schedules and payment balances."
        actions={
          <Link
            href="/customers/register"
            className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <Plus className="size-4" />
            New Sale
          </Link>
        }
      />

      {/* Sales overview with Show/Hide functionality */}
      <PageStats columns={4} defaultVisible showToggle>
        {summaryCards.map((card) => {
          const Icon = card.icon;

          return (
            <div
              key={card.label}
              className="rounded-xl border border-border/70 bg-card p-4 shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-muted-foreground">
                  {card.label}
                </p>

                <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </div>
              </div>

              <p className="mt-3 text-xl font-bold tracking-tight tabular-nums">
                {card.value}
              </p>
            </div>
          );
        })}
      </PageStats>

      <DataTable
        title="Sales Records"
        description="Search and manage all registered sales. Financial summary cards show the current page only."
        columns={columns}
        rows={rows}
        searchable
        searchPlaceholder="Bill number, customer, NIC or mobile..."
        filters={[
          {
            name: "status",
            label: "Sale Status",
            placeholder: "All Statuses",
            value: status === "ALL" ? "" : status,
            options: [
              { label: "Active", value: "ACTIVE" },
              { label: "Paid", value: "PAID" },
              { label: "Cancelled", value: "CANCELLED" },
              {
                label: "Written Off",
                value: "WRITTEN_OFF",
              },
            ],
          },
        ]}
        page={currentPage}
        pageSize={PAGE_SIZE}
        totalRows={totalRows}
        pageHref={(nextPage) => buildSalesUrl(q, status, nextPage)}
        emptyTitle="No sales found"
        emptyDescription="No sales match your search or selected status."
      />
    </div>
  );
}
