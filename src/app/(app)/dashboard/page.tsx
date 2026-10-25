import { Suspense } from "react";
import { connection } from "next/server";
import {
  Activity,
  Banknote,
  Users,
  Wallet,
  ArrowUpRight,
  CalendarDays,
} from "lucide-react";

import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const currencyFormatter = new Intl.NumberFormat("en-LK", {
  style: "currency",
  currency: "LKR",
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("en-LK", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatCurrency(value: number | string | { toString(): string }) {
  return currencyFormatter.format(Number(value));
}

function DashboardFallback() {
  return (
    <div className="space-y-6" role="status" aria-live="polite">
      <div className="h-24 animate-pulse rounded-xl bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-32 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-xl bg-muted" />
      <span className="sr-only">Loading dashboard…</span>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardFallback />}>
      <DashboardContent />
    </Suspense>
  );
}

async function DashboardContent() {
  await connection();

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const startOfTomorrow = new Date(startOfDay);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  const [
    totalCustomers,
    activeSales,
    activeSalesTotals,
    advances,
    todayCollections,
    recentCollections,
  ] = await Promise.all([
    prisma.customer.count(),

    prisma.sale.count({
      where: { status: "ACTIVE" },
    }),

    prisma.sale.aggregate({
      where: { status: "ACTIVE" },
      _sum: { totalAmount: true },
    }),

    prisma.sale.aggregate({
      where: { status: "ACTIVE" },
      _sum: { advancePayment: true },
    }),

    prisma.payment.aggregate({
      where: {
        status: "POSTED",
        paymentDate: {
          gte: startOfDay,
          lt: startOfTomorrow,
        },
      },
      _sum: { amount: true },
    }),

    prisma.payment.findMany({
      where: {
        status: "POSTED",
        sale: { status: { not: "CANCELLED" } },
      },
      orderBy: { paymentDate: "desc" },
      take: 8,
      select: {
        id: true,
        amount: true,
        paymentDate: true,
        sale: {
          select: {
            billNumber: true,
            customer: {
              select: { fullName: true },
            },
          },
        },
        collectedBy: {
          select: { fullName: true },
        },
      },
    }),
  ]);

  const postedPayments = await prisma.payment.aggregate({
    where: {
      status: "POSTED",
      sale: { status: "ACTIVE" },
    },
    _sum: { amount: true },
  });

  const totalSaleAmount = Number(activeSalesTotals._sum.totalAmount ?? 0);
  const totalAdvances = Number(advances._sum.advancePayment ?? 0);
  const totalPostedPayments = Number(postedPayments._sum.amount ?? 0);

  const outstandingBalance = Math.max(
    0,
    totalSaleAmount - totalAdvances - totalPostedPayments,
  );

  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-6">
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description="Monitor your customer accounts, installment sales, and daily collections."
        actions={
          <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
            <CalendarDays className="size-4" />
            {new Intl.DateTimeFormat("en-LK", {
              dateStyle: "medium",
            }).format(now)}
          </div>
        }
      />

      <section
        aria-label="Business overview"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          title="Total Customers"
          value={totalCustomers.toLocaleString("en-LK")}
          description="Registered customer accounts"
          icon={<Users className="size-5" />}
        />

        <StatCard
          title="Active Sales"
          value={activeSales.toLocaleString("en-LK")}
          description="Sales with an active balance"
          icon={<Activity className="size-5" />}
        />

        <StatCard
          title="Today's Collections"
          value={formatCurrency(todayCollections._sum.amount ?? 0)}
          description="Posted payments received today"
          icon={<Banknote className="size-5" />}
        />

        <StatCard
          title="Outstanding Balance"
          value={formatCurrency(outstandingBalance)}
          description="Remaining balance on active sales"
          icon={<Wallet className="size-5" />}
          className="border-primary/20"
        />
      </section>

      <Card className="gap-0 py-0">
        <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="space-y-1">
            <CardTitle className="text-base">Recent Collections</CardTitle>
            <p className="text-sm text-muted-foreground">
              Latest posted customer payments
            </p>
          </div>
          <ArrowUpRight
            className="size-5 text-muted-foreground"
            aria-hidden="true"
          />
        </CardHeader>

        <CardContent className="p-0">
          {recentCollections.length === 0 ? (
            <div className="flex min-h-40 flex-col items-center justify-center px-5 py-10 text-center">
              <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-muted">
                <Banknote className="size-5 text-muted-foreground" />
              </div>
              <p className="font-medium">No collections yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Posted customer payments will appear here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-muted-foreground">
                    <th className="px-5 py-3 font-medium">Customer</th>
                    <th className="px-5 py-3 font-medium">Bill number</th>
                    <th className="px-5 py-3 font-medium">Collected by</th>
                    <th className="px-5 py-3 font-medium">Payment date</th>
                    <th className="px-5 py-3 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCollections.map((payment) => (
                    <tr
                      key={payment.id}
                      className="border-b border-border last:border-0 transition-colors hover:bg-muted/30"
                    >
                      <td className="px-5 py-4 font-medium text-foreground">
                        {payment.sale.customer.fullName}
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">
                        {payment.sale.billNumber}
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">
                        {payment.collectedBy.fullName}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-muted-foreground">
                        {dateFormatter.format(payment.paymentDate)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-right font-semibold tabular-nums">
                        {formatCurrency(payment.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
