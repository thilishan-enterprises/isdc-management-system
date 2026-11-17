import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";

const MAX_SELECTED_RECORDS = 5000;

function escapeCsv(value: string | number | null | undefined) {
  const text = String(value ?? "");

  // Prevent spreadsheet formula injection.
  const safeText = /^[\s]*[=+\-@\t\r]/.test(text) ? `'${text}` : text;

  return `"${safeText.replace(/"/g, '""')}"`;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Colombo",
  }).format(date);
}

export async function POST(request: NextRequest) {
  const session = await getActiveSession();

  if (!session) {
    return NextResponse.json(
      { error: "Authentication is required to export selected customers." },
      { status: 401 },
    );
  }

  try {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body." },
        { status: 400 },
      );
    }

    if (typeof body !== "object" || body === null || !("ids" in body)) {
      return NextResponse.json(
        { error: "No customer IDs were provided." },
        { status: 400 },
      );
    }

    const ids = (body as { ids: unknown }).ids;

    if (
      !Array.isArray(ids) ||
      ids.length === 0 ||
      ids.some(
        (id) =>
          typeof id !== "string" || id.trim().length === 0 || id.length > 100,
      )
    ) {
      return NextResponse.json(
        { error: "Invalid customer selection." },
        { status: 400 },
      );
    }

    if (ids.length > MAX_SELECTED_RECORDS) {
      return NextResponse.json(
        {
          error: `You can export a maximum of ${MAX_SELECTED_RECORDS} customers at once.`,
        },
        { status: 400 },
      );
    }

    const uniqueIds = [...new Set(ids as string[])];

    // Fetch only the selected customers from PostgreSQL.
    const customers = await prisma.customer.findMany({
      where: {
        id: {
          in: uniqueIds,
        },
      },
      select: {
        id: true,
        fullName: true,
        nic: true,
        mobile: true,
        additionalMobile: true,
        address: true,
        area: true,
        guarantorDetails: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (customers.length !== uniqueIds.length) {
      return NextResponse.json(
        {
          error:
            "Some selected customers no longer exist. Please refresh the page and try again.",
        },
        { status: 409 },
      );
    }

    // Preserve the order in which records were selected.
    const customerById = new Map(
      customers.map((customer) => [customer.id, customer]),
    );

    const orderedCustomers = uniqueIds
      .map((id) => customerById.get(id))
      .filter((customer) => customer !== undefined);

    const headers = [
      "Customer ID",
      "Customer Name",
      "NIC Number",
      "Primary Mobile",
      "Additional Mobile",
      "Address",
      "Collection Area",
      "Guarantor Details",
      "Additional Notes",
      "Registered Date",
      "Last Updated",
    ];

    const csvRows = orderedCustomers.map((customer) => [
      customer.id,
      customer.fullName,
      customer.nic,
      customer.mobile,
      customer.additionalMobile ?? "",
      customer.address,
      customer.area ?? "",
      customer.guarantorDetails ?? "",
      customer.notes ?? "",
      formatDate(customer.createdAt),
      formatDate(customer.updatedAt),
    ]);

    const csv = [
      headers.map(escapeCsv).join(","),
      ...csvRows.map((row) => row.map(escapeCsv).join(",")),
    ].join("\r\n");

    return new NextResponse(`\uFEFF${csv}`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="customers-selected.csv"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    console.error("Selected customer export failed.");

    return NextResponse.json(
      { error: "Unable to export selected customers." },
      { status: 500 },
    );
  }
}
