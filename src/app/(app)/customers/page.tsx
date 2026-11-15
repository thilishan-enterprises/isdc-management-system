import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRow,
} from "@/components/common/data-table";
import { CalendarDays, Download, UserPlus } from "lucide-react";
import { PageWorkspace } from "@/components/layout/page-workspace";
import { DataTableToolbar } from "@/components/common/data-table-toolbar";
import { requireUser } from "@/lib/auth-guards";
import { connection } from "next/server";
import { RouteToast } from "@/components/common/route-toast";

type CustomersPageProps = {
  searchParams: Promise<{
    sort?: string;
    direction?: string;
    size?: string;
    created?: string;
    error?: string;
    q?: string;
    area?: string;
    page?: string;
  }>;
};

function CustomersFallback() {
  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-5" role="status">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
      <div className="h-12 animate-pulse rounded-xl bg-muted" />
      <div className="h-72 animate-pulse rounded-xl bg-muted" />
      <span className="sr-only">Loading customers...</span>
    </div>
  );
}

function formatRegisteredDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Colombo",
  }).format(date);
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function buildCustomersUrl(
  q: string,
  area: string,
  page: number,
  sort: string,
  direction: string,
  size: number,
) {
  const params = new URLSearchParams();

  if (q) params.set("q", q);
  if (area) params.set("area", area);
  if (page > 1) params.set("page", String(page));
  if (sort) params.set("sort", sort);
  if (direction) params.set("direction", direction);
  params.set("size", String(size));

  return `/customers?${params.toString()}`;
}

const columns: DataTableColumn[] = [
  { key: "customer", header: "Customer", sortable: true },
  { key: "nic", header: "NIC Number", sortable: true },
  { key: "mobile", header: "Mobile", sortable: true },
  { key: "address", header: "Address" },
  { key: "area", header: "Collection Area", sortable: true },
  { key: "registered", header: "Registered", sortable: true },
];

export default function CustomersPage({ searchParams }: CustomersPageProps) {
  return (
    <Suspense fallback={<CustomersFallback />}>
      <CustomersContent searchParams={searchParams} />
    </Suspense>
  );
}

async function CustomersContent({ searchParams }: CustomersPageProps) {
  await connection();

  const session = await requireUser();
  const params = await searchParams;

  const allowedSorts = [
    "customer",
    "nic",
    "mobile",
    "area",
    "registered",
  ] as const;

  type CustomerSort = (typeof allowedSorts)[number];

  const sort: CustomerSort = allowedSorts.includes(params.sort as CustomerSort)
    ? (params.sort as CustomerSort)
    : "registered";

  const direction = params.direction === "asc" ? "asc" : "desc";

  const requestedSize = Number(params.size ?? "25");
  const pageSize = [10, 25, 50, 100].includes(requestedSize)
    ? requestedSize
    : 25;

  const sortFields = {
    customer: "fullName",
    nic: "nic",
    mobile: "mobile",
    area: "area",
    registered: "createdAt",
  } as const;

  const q = typeof params.q === "string" ? params.q.trim().slice(0, 150) : "";

  const area =
    typeof params.area === "string" ? params.area.trim().slice(0, 150) : "";

  const requestedPage = Number(params.page ?? "1");

  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;

  // Get available collection areas for the filter.
  const availableAreas = await prisma.customer.findMany({
    where: {
      area: {
        not: null,
      },
    },
    select: {
      area: true,
    },
    distinct: ["area"],
    orderBy: {
      area: "asc",
    },
  });

  const areaOptions = availableAreas
    .map((customer) => customer.area)
    .filter(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    );

  // Search and filter conditions.
  const where = {
    ...(area
      ? {
          area: {
            equals: area,
            mode: "insensitive" as const,
          },
        }
      : {}),

    ...(q
      ? {
          OR: [
            {
              fullName: {
                contains: q,
                mode: "insensitive" as const,
              },
            },
            {
              nic: {
                contains: q,
                mode: "insensitive" as const,
              },
            },
            {
              mobile: {
                contains: q,
                mode: "insensitive" as const,
              },
            },
            {
              additionalMobile: {
                contains: q,
                mode: "insensitive" as const,
              },
            },
            {
              address: {
                contains: q,
                mode: "insensitive" as const,
              },
            },
            {
              area: {
                contains: q,
                mode: "insensitive" as const,
              },
            },
          ],
        }
      : {}),
  };

  // Count matching records and all customers.
  const [totalRows, totalCustomers] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.count(),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  const currentPage = Math.min(page, totalPages);

  // Load only the customers required for this page.
  const customers = await prisma.customer.findMany({
    where,
    orderBy: [{ [sortFields[sort]]: direction }, { id: "desc" }],
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      fullName: true,
      nic: true,
      mobile: true,
      additionalMobile: true,
      address: true,
      area: true,
      createdAt: true,
    },
  });

  const rows: DataTableRow[] = customers.map((customer) => ({
    id: customer.id,

    cells: {
      customer: (
        <div className="flex min-w-[180px] items-center gap-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
            {getInitials(customer.fullName)}
          </div>

          <div className="min-w-0">
            <p className="font-medium text-foreground">{customer.fullName}</p>
          </div>
        </div>
      ),

      nic: (
        <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">
          {customer.nic}
        </span>
      ),

      mobile: (
        <div className="space-y-0.5">
          <p className="whitespace-nowrap text-sm">{customer.mobile}</p>

          {customer.additionalMobile && (
            <p className="whitespace-nowrap text-xs text-muted-foreground">
              {customer.additionalMobile}
            </p>
          )}
        </div>
      ),

      address: (
        <p className="max-w-[300px] text-sm leading-5">{customer.address}</p>
      ),

      area: (
        <span className="text-xs text-muted-foreground">
          {customer.area || "—"}
        </span>
      ),

      registered: (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
          <CalendarDays className="size-3.5" />
          {formatRegisteredDate(customer.createdAt)}
        </span>
      ),
    },
  }));

  const areaFilters = [
    {
      name: "area",
      label: "Collection Area",
      placeholder: "All Areas",
      value: area,
      options: [
        ...(area &&
        !areaOptions.some(
          (option) => option.toLowerCase() === area.toLowerCase(),
        )
          ? [{ label: area, value: area }]
          : []),
        ...areaOptions.map((option) => ({
          label: option,
          value: option,
        })),
      ],
    },
  ];

  const exportUrl = `/customers/export?${new URLSearchParams({
    q,
    area,
    sort,
    direction,
  }).toString()}`;

  return (
    <>
      <RouteToast messages={customerToastMessages} />
      <PageWorkspace
        className="h-[calc(100svh-7rem)] md:h-[calc(100svh-7rem)]"
        scrollMode="table"
        header={
          <>
            <PageHeader
              title="Customer Directory"
              count={totalCustomers}
              countLabel="customers"
              compact
              actions={
                <>
                  <a
                    href={exportUrl}
                    download
                    className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-input bg-background px-3.5 text-sm font-medium transition-colors hover:bg-muted"
                  >
                    <Download className="size-4" />
                    Export All
                  </a>
                  <Link
                    href="/customers/new"
                    className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                  >
                    <UserPlus className="size-4" />
                    New Customer
                  </Link>
                </>
              }
            />
          </>
        }
        toolbar={
          <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm [&>div]:border-b-0">
            <DataTableToolbar
              searchPlaceholder="Search name, NIC, mobile or address..."
              filters={areaFilters}
            />
          </div>
        }
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <DataTable
            fillHeight
            customerManagementRole={session.user.role}
            columns={columns}
            rows={rows}
            page={currentPage}
            pageSize={pageSize}
            totalRows={totalRows}
            pageHref={(nextPage) =>
              buildCustomersUrl(q, area, nextPage, sort, direction, pageSize)
            }
            sort={sort}
            direction={direction}
            sortHref={(key, nextDirection) =>
              buildCustomersUrl(q, area, 1, key, nextDirection, pageSize)
            }
            pageSizeOptions={[10, 25, 50, 100]}
            pageSizeHref={(size) =>
              buildCustomersUrl(q, area, 1, sort, direction, size)
            }
            selectable
            exportFilename="customers.csv"
            exportRows={customers.map((customer) => ({
              Name: customer.fullName,
              NIC: customer.nic,
              Mobile: customer.mobile,
              AdditionalMobile: customer.additionalMobile,
              Address: customer.address,
              Area: customer.area,
              Registered: formatRegisteredDate(customer.createdAt),
            }))}
            emptyTitle={
              totalCustomers === 0
                ? "No customers registered yet"
                : "No matching customers"
            }
            emptyDescription={
              totalCustomers === 0
                ? "Customer records will appear here once they have been registered."
                : "Try searching with a different name, NIC, mobile number, address or collection area."
            }
          />
        </div>
      </PageWorkspace>
    </>
  );
}

const customerToastMessages = {
  created: {
    type: "success",
    title: "Customer registered successfully",
    description: "The new customer has been added.",
  },
  "error:invalid": {
    type: "error",
    title: "Invalid customer details",
    description: "Please check the entered information.",
  },
  "error:duplicate": {
    type: "warning",
    title: "Customer already exists",
    description: "This NIC or mobile number is already registered.",
  },
  "error:failed": {
    type: "error",
    title: "Registration failed",
    description: "Unable to register the customer. Please try again.",
  },
} as const;
