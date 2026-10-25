import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-guards";
import { createEmployee } from "./actions";

type EmployeesPageProps = {
  searchParams: Promise<{
    created?: string;
    error?: string;
  }>;
};

function LoadingEmployees() {
  return (
    <main className="min-h-screen bg-slate-950 p-8 text-white">
      Loading employees...
    </main>
  );
}

export default function EmployeesPage({ searchParams }: EmployeesPageProps) {
  return (
    <Suspense fallback={<LoadingEmployees />}>
      <EmployeesContent searchParams={searchParams} />
    </Suspense>
  );
}

async function EmployeesContent({ searchParams }: EmployeesPageProps) {
  const session = await requireUser();
  const params = await searchParams;
  const isAdmin = session.user.role === "ADMIN";

  const employees = await prisma.employee.findMany({
    orderBy: { fullName: "asc" },
  });

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/dashboard"
          className="text-sm text-blue-400 hover:text-blue-300"
        >
          ← Back to Dashboard
        </Link>

        <header className="mt-5 mb-8">
          <h1 className="text-3xl font-semibold">Employee Management</h1>
          <p className="mt-2 text-sm text-slate-400">
            View employee details and collection commission rates.
          </p>
        </header>

        {params.created === "1" && (
          <p className="mb-5 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-300">
            Employee created successfully.
          </p>
        )}

        {params.error === "invalid" && (
          <p
            role="alert"
            className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"
          >
            Please check the employee details and commission rate. The rate must
            be between 0 and 100.
          </p>
        )}

        {isAdmin && (
          <section className="mb-8 rounded-xl border border-white/10 bg-slate-900 p-6">
            <h2 className="mb-5 text-xl font-semibold">Add Employee</h2>

            <form action={createEmployee} className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="fullName" className="mb-2 block text-sm">
                  Full name *
                </label>
                <input
                  id="fullName"
                  name="fullName"
                  required
                  maxLength={150}
                  className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 outline-none focus:border-blue-400"
                />
              </div>

              <div>
                <label htmlFor="mobile" className="mb-2 block text-sm">
                  Mobile number
                </label>
                <input
                  id="mobile"
                  name="mobile"
                  type="tel"
                  maxLength={30}
                  className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 outline-none focus:border-blue-400"
                />
              </div>

              <div>
                <label htmlFor="commissionRate" className="mb-2 block text-sm">
                  Commission rate (%)
                </label>
                <input
                  id="commissionRate"
                  name="commissionRate"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  defaultValue="10"
                  required
                  className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 outline-none focus:border-blue-400"
                />
              </div>

              <div>
                <label htmlFor="address" className="mb-2 block text-sm">
                  Address
                </label>
                <input
                  id="address"
                  name="address"
                  maxLength={500}
                  className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 outline-none focus:border-blue-400"
                />
              </div>

              <div className="sm:col-span-2">
                <button
                  type="submit"
                  className="rounded-lg bg-blue-500 px-5 py-2.5 font-medium hover:bg-blue-400"
                >
                  Create Employee
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="overflow-hidden rounded-xl border border-white/10 bg-slate-900">
          <div className="border-b border-white/10 p-5">
            <h2 className="font-semibold">Employees ({employees.length})</h2>
          </div>

          {employees.length === 0 ? (
            <p className="p-6 text-sm text-slate-400">
              No employees have been added yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-950 text-slate-400">
                  <tr>
                    <th className="px-5 py-3 font-medium">Name</th>
                    <th className="px-5 py-3 font-medium">Mobile</th>
                    <th className="px-5 py-3 font-medium">Commission</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {employees.map((employee) => (
                    <tr key={employee.id}>
                      <td className="px-5 py-4 font-medium">
                        {employee.fullName}
                      </td>
                      <td className="px-5 py-4 text-slate-300">
                        {employee.mobile || "—"}
                      </td>
                      <td className="px-5 py-4 text-slate-300">
                        {Number(employee.commissionRate).toFixed(2)}%
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={
                            employee.isActive
                              ? "text-green-400"
                              : "text-slate-500"
                          }
                        >
                          {employee.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
