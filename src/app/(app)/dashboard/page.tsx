import { Suspense } from "react";
import { connection } from "next/server";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { logout } from "./actions";

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
          Loading dashboard...
        </main>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}

async function DashboardContent() {
  await connection();

  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <p className="text-sm font-medium text-blue-400">
              Installment Management
            </p>

            <h1 className="mt-2 text-3xl font-semibold">Dashboard</h1>
          </div>

          <form action={logout}>
            <button
              type="submit"
              className="rounded-lg border border-white/15 px-4 py-2 text-sm transition hover:bg-white/10"
            >
              Sign out
            </button>
          </form>
        </header>

        <section className="mt-8 rounded-xl border border-white/10 bg-slate-900 p-6">
          <h2 className="text-lg font-semibold">
            Welcome, {session.user.username}
          </h2>

          <p className="mt-2 text-sm text-slate-400">
            You are successfully signed in.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg bg-slate-950 p-4">
              <p className="text-sm text-slate-400">Username</p>
              <p className="mt-1 font-medium">{session.user.username}</p>
            </div>

            <div className="rounded-lg bg-slate-950 p-4">
              <p className="text-sm text-slate-400">Account role</p>
              <p className="mt-1 font-medium">{session.user.role}</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
