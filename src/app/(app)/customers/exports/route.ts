import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-guards";

function csvCell(value: string | number | null | undefined) {
  let text = String(value ?? "");

  // Prevent spreadsheet formula execution in CSV cells.
  if (/^[\s]*[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Colombo",
  }).format(date);
}

export async function GET(request: NextRequest) {
  // Use your application's existing server-side
  // authentication and authorization checks here.
  const user = await requireUser();

  if (!user) {
    return new NextResponse("Unauthorized", {
      status: 401,
    });
  }

  const params = request.nextUrl.searchParams;

  const q = (params.get("q") ?? "").trim().slice(0, 150);
  const area = (params.get("area") ?? "").trim().slice(0, 150);

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

  const allowedSorts = {
    customer: "fullName",
    nic: "nic",
    mobile: "mobile",
    area: "area",
    registered: "createdAt",
  } as const;

  const requestedSort = params.get("sort") ?? "registered";

  const sort = Object.prototype.hasOwnProperty.call(allowedSorts, requestedSort)
    ? (requestedSort as keyof typeof allowedSorts)
    : "registered";

  const direction = params.get("direction") === "asc" ? "asc" : "desc";

  const customers = await prisma.customer.findMany({
    where,
    orderBy: [{ [allowedSorts[sort]]: direction }, { id: "desc" }],
    select: {
      fullName: true,
      nic: true,
      mobile: true,
      additionalMobile: true,
      address: true,
      area: true,
      createdAt: true,
    },
  });

  const headers = [
    "Customer Name",
    "NIC Number",
    "Mobile",
    "Additional Mobile",
    "Address",
    "Collection Area",
    "Registered Date",
  ];

  const csvRows = customers.map((customer) =>
    [
      customer.fullName,
      customer.nic,
      customer.mobile,
      customer.additionalMobile,
      customer.address,
      customer.area,
      formatDate(customer.createdAt),
    ]
      .map(csvCell)
      .join(","),
  );

  const csv = [headers.map(csvCell).join(","), ...csvRows].join("\r\n");

  const filename = `customers-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse("\uFEFF" + csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
