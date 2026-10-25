"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guards";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createEmployee(formData: FormData) {
  await requireAdmin();

  const fullName = String(formData.get("fullName") ?? "").trim();
  const mobile = String(formData.get("mobile") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const commissionRateInput = String(
    formData.get("commissionRate") ?? "10",
  ).trim();

  const commissionRate = Number(commissionRateInput);

  if (
    !fullName ||
    fullName.length > 150 ||
    mobile.length > 30 ||
    address.length > 500 ||
    !Number.isFinite(commissionRate) ||
    commissionRate < 0 ||
    commissionRate > 100
  ) {
    redirect("/employees?error=invalid");
  }

  await prisma.employee.create({
    data: {
      fullName,
      mobile: mobile || null,
      address: address || null,
      commissionRate: commissionRate.toFixed(2),
    },
  });

  revalidatePath("/employees");
  redirect("/employees?created=1");
}
