import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-guards";

function csvCell(value: string | number | null | undefined) {
  let text = String(value ?? "");

  // Prevent CSV formula injection when opened in Excel.
  if (/^\s*[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Colombo",
  }).format(date);
}

export async function GET() {
  // Only authenticated users can export customer data.
  await requireUser();

  // Fetch ALL customers without search, filters or pagination.
  const customers = await prisma.customer.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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

  const csvRows = customers.map((customer) =>
    [
      customer.id,
      customer.fullName,
      customer.nic,
      customer.mobile,
      customer.additionalMobile,
      customer.address,
      customer.area,
      customer.guarantorDetails,
      customer.notes,
      formatDate(customer.createdAt),
      formatDate(customer.updatedAt),
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
