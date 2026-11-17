import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { cache } from "react";
import { isAccountActive } from "@/lib/account-status";

export const getActiveSession = cache(async () => {
  const session = await auth();

  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      username: true,
      role: true,
      employeeId: true,
      isActive: true,
      employee: { select: { isActive: true } },
    },
  });

  if (!user || !isAccountActive(user)) {
    return null;
  }

  session.user.username = user.username;
  session.user.name = user.username;
  session.user.role = user.role;
  session.user.employeeId = user.employeeId;

  return session;
});

export async function requireUser() {
  const session = await getActiveSession();

  if (!session) redirect("/login");

  return session;
}

export async function requireAdmin() {
  const session = await requireUser();

  if (session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  return session;
}
