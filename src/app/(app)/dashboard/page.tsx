import { Suspense } from "react";
import { connection } from "next/server";

import {
  Activity,
  Banknote,
  CalendarDays,
  ReceiptText,
  Users,
  Wallet,
} from "lucide-react";

import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const amountFormatter = new Intl.NumberFormat("en-LK", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("en-LK", {
  dateStyle: "medium",
  timeStyle: "short",
});

const dashboardDateFormatter = new Intl.DateTimeFormat("en-LK", {
  dateStyle: "medium",
});

function formatCurrency(value: number | string | { toString(): string }) {
  return `LKR ${amountFormatter.format(Number(value))}`;
}

function DashboardFallback() {
  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-6" role="status">
      <div className="h-24 animate-pulse rounded-2xl bg-muted" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="h-36 animate-pulse rounded-2xl bg-muted"
          />
        ))}
      </div>

      <div className="h-80 animate-pulse rounded-2xl bg-muted" />
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
    <div className="mx-auto w-full max-w-screen-2xl space-y-7">
      <PageHeader
        eyebrow="OVERVIEW"
        title="Dashboard"
        description="A snapshot of your current business performance."
        actions={
          <div className="inline-flex h-10 items-center gap-2 rounded-xl border border-border/70 bg-card px-3 text-sm font-medium text-muted-foreground shadow-sm">
            <CalendarDays className="size-4" />
            <span>{dashboardDateFormatter.format(now)}</span>
          </div>
        }
      />

      {/* Business overview */}
      <section aria-label="Business overview" className="space-y-4">
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Total Customers"
            value={totalCustomers.toLocaleString("en-LK")}
            description="Registered customer accounts"
            icon={<Users className="size-5" />}
            tone="blue"
          />

          <StatCard
            title="Active Sales"
            value={activeSales.toLocaleString("en-LK")}
            description="Sales with an active balance"
            icon={<Activity className="size-5" />}
            tone="violet"
          />

          <StatCard
            title="Today's Collections"
            value={formatCurrency(todayCollections._sum.amount ?? 0)}
            description="Posted payments received today"
            icon={<Banknote className="size-5" />}
            tone="emerald"
          />

          <StatCard
            title="Outstanding Balance"
            value={formatCurrency(outstandingBalance)}
            description="Remaining balance on active sales"
            icon={<Wallet className="size-5" />}
            tone="amber"
            className="border-amber-500/20"
          />
        </div>
      </section>

      {/* Recent collections */}
      <Card className="gap-0 overflow-hidden border-border/70 bg-card py-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border/70 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ReceiptText className="size-5" />
            </div>

            <div className="min-w-0 space-y-1">
              <CardTitle className="text-sm font-semibold sm:text-base">
                Recent Collections
              </CardTitle>
              <p className="text-xs text-muted-foreground sm:text-sm">
                Latest posted customer payments
              </p>
            </div>
          </div>

          <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Latest {recentCollections.length}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {recentCollections.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center px-5 py-12 text-center">
              <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-muted">
                <Banknote className="size-6 text-muted-foreground" />
              </div>

              <p className="text-sm font-semibold">No collections yet</p>

              <p className="mt-1 max-w-xs text-sm leading-6 text-muted-foreground">
                Posted customer payments will appear here when collections are
                recorded.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border/70 bg-muted/30 text-xs text-muted-foreground">
                    <th className="px-5 py-3.5 font-medium sm:px-6">
                      Customer
                    </th>
                    <th className="px-5 py-3.5 font-medium">Bill number</th>
                    <th className="px-5 py-3.5 font-medium">Collected by</th>
                    <th className="px-5 py-3.5 font-medium">Payment date</th>
                    <th className="px-5 py-3.5 text-right font-medium sm:px-6">
                      Amount
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {recentCollections.map((payment) => (
                    <tr
                      key={payment.id}
                      className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/30"
                    >
                      <td className="px-5 py-4 sm:px-6">
                        <div className="flex items-center gap-3">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                            {payment.sale.customer.fullName
                              .trim()
                              .slice(0, 2)
                              .toUpperCase()}
                          </div>

                          <span className="font-medium text-foreground">
                            {payment.sale.customer.fullName}
                          </span>
                        </div>
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 font-medium text-muted-foreground">
                        {payment.sale.billNumber}
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 text-muted-foreground">
                        {payment.collectedBy.fullName}
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 text-muted-foreground">
                        {dateFormatter.format(payment.paymentDate)}
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 text-right font-semibold tabular-nums text-foreground sm:px-6">
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
