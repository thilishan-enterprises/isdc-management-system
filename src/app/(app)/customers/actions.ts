"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-guards";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createCustomer(formData: FormData) {
  await requireUser();

  const fullName = String(formData.get("fullName") ?? "").trim();
  const nic = String(formData.get("nic") ?? "")
    .trim()
    .toUpperCase();
  const mobile = String(formData.get("mobile") ?? "").trim();
  const additionalMobile = String(
    formData.get("additionalMobile") ?? "",
  ).trim();
  const address = String(formData.get("address") ?? "").trim();
  const area = String(formData.get("area") ?? "").trim();
  const guarantorDetails = String(
    formData.get("guarantorDetails") ?? "",
  ).trim();
  const notes = String(formData.get("notes") ?? "").trim();

  const valid =
    fullName.length >= 2 &&
    fullName.length <= 150 &&
    nic.length >= 5 &&
    nic.length <= 20 &&
    /^[A-Za-z0-9-]+$/.test(nic) &&
    mobile.length >= 7 &&
    mobile.length <= 20 &&
    /^[0-9+()\-\s]+$/.test(mobile) &&
    address.length >= 3 &&
    address.length <= 500 &&
    area.length <= 150 &&
    guarantorDetails.length <= 2000 &&
    notes.length <= 2000;

  if (!valid) {
    redirect("/customers?error=invalid");
  }

  try {
    await prisma.customer.create({
      data: {
        fullName,
        nic,
        mobile,
        additionalMobile: additionalMobile || null,
        address,
        area: area || null,
        guarantorDetails: guarantorDetails || null,
        notes: notes || null,
      },
    });
  } catch (error: unknown) {
    const isDuplicate =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002";

    if (isDuplicate) {
      redirect("/customers?error=duplicate");
    }

    console.error("Customer creation failed.");
    redirect("/customers?error=failed");
  }

  revalidatePath("/customers");
  redirect("/customers?created=1");
}

function addMonthsUTC(date: Date, monthsToAdd: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + monthsToAdd;
  const day = date.getUTCDate();

  const targetMonth = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(
    Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 0),
  ).getUTCDate();

  return new Date(
    Date.UTC(
      targetMonth.getUTCFullYear(),
      targetMonth.getUTCMonth(),
      Math.min(day, lastDay),
    ),
  );
}

function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const date = new Date(`${value}T00:00:00.000Z`);

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    return null;
  }

  return date;
}

function toCents(value: string): number | null {
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(value)) return null;

  const amount = Number(value);

  if (!Number.isFinite(amount)) return null;

  const cents = Math.round(amount * 100);

  return cents <= 999_999_999_999 ? cents : null;
}

function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

export type SaleRegistrationState = {
  error?: string;
};

export async function createSaleRegistration(
  _previousState: SaleRegistrationState,
  formData: FormData,
): Promise<SaleRegistrationState> {
  await requireUser();

  const billNumber = String(formData.get("billNumber") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const nic = String(formData.get("nic") ?? "")
    .trim()
    .toUpperCase();
  const mobile = String(formData.get("mobile") ?? "").trim();
  const additionalMobile = String(
    formData.get("additionalMobile") ?? "",
  ).trim();
  const address = String(formData.get("address") ?? "").trim();
  const area = String(formData.get("area") ?? "").trim();
  const guarantorDetails = String(
    formData.get("guarantorDetails") ?? "",
  ).trim();
  const salesEmployeeId = String(formData.get("salesEmployeeId") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  // Read multiple sale items from the form.
  const itemsText = String(formData.get("items") ?? "");

  let parsedItems: unknown;

  try {
    parsedItems = JSON.parse(itemsText);
  } catch {
    return { error: "invalid" };
  }

  if (
    !Array.isArray(parsedItems) ||
    parsedItems.length === 0 ||
    parsedItems.length > 100
  ) {
    return { error: "invalid" };
  }

  // Normalize and validate each submitted item.
  const items: {
    productId: string;
    productBrandId: string | null;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
  }[] = [];

  const itemKeys = new Set<string>();
  let totalCents = 0;

  for (const rawItem of parsedItems) {
    if (
      typeof rawItem !== "object" ||
      rawItem === null ||
      Array.isArray(rawItem)
    ) {
      return { error: "invalid" };
    }

    const item = rawItem as Record<string, unknown>;

    const productId =
      typeof item.productId === "string" ? item.productId.trim() : "";

    const productBrandId =
      item.productBrandId === null ||
      item.productBrandId === undefined ||
      item.productBrandId === ""
        ? null
        : typeof item.productBrandId === "string"
          ? item.productBrandId.trim()
          : null;

    const quantity = Number(item.quantity);
    const unitPriceCents = toCents(String(item.unitPrice ?? ""));

    if (
      !productId ||
      (item.productBrandId !== null &&
        item.productBrandId !== undefined &&
        item.productBrandId !== "" &&
        (typeof item.productBrandId !== "string" || !productBrandId)) ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 10000 ||
      unitPriceCents === null ||
      unitPriceCents <= 0
    ) {
      return { error: "invalid" };
    }

    const itemKey = `${productId}:${productBrandId ?? "base"}`;

    // The same product and brand combination must appear only once.
    if (itemKeys.has(itemKey)) {
      return { error: "invalid" };
    }

    itemKeys.add(itemKey);

    const lineTotalCents = unitPriceCents * quantity;

    if (!Number.isSafeInteger(lineTotalCents)) {
      return { error: "amount" };
    }

    totalCents += lineTotalCents;

    if (!Number.isSafeInteger(totalCents)) {
      return { error: "amount" };
    }

    items.push({
      productId,
      productBrandId,
      quantity,
      unitPriceCents,
      lineTotalCents,
    });
  }

  const advanceCents = toCents(String(formData.get("advancePayment") ?? ""));

  const monthlyCents = toCents(
    String(formData.get("monthlyInstallmentAmount") ?? ""),
  );

  const saleDate = parseDate(String(formData.get("saleDate") ?? ""));

  const firstInstallmentDate = parseDate(
    String(formData.get("firstInstallmentDate") ?? ""),
  );

  const valid =
    billNumber.length >= 1 &&
    billNumber.length <= 50 &&
    /^[A-Za-z0-9/-]+$/.test(billNumber) &&
    fullName.length >= 2 &&
    fullName.length <= 150 &&
    nic.length >= 5 &&
    nic.length <= 20 &&
    /^[A-Z0-9-]+$/.test(nic) &&
    mobile.length >= 7 &&
    mobile.length <= 20 &&
    /^[0-9+()\-\s]+$/.test(mobile) &&
    address.length >= 3 &&
    address.length <= 500 &&
    area.length <= 150 &&
    additionalMobile.length <= 20 &&
    guarantorDetails.length <= 2000 &&
    notes.length <= 2000 &&
    advanceCents !== null &&
    monthlyCents !== null &&
    advanceCents >= 0 &&
    monthlyCents >= 0 &&
    saleDate !== null &&
    firstInstallmentDate !== null;

  if (!valid) {
    return { error: "invalid" };
  }

  if (advanceCents > totalCents) {
    return { error: "amount" };
  }

  const balanceCents = totalCents - advanceCents;

  if (balanceCents > 0 && monthlyCents <= 0) {
    return { error: "installment" };
  }

  const installmentCount =
    balanceCents > 0 ? Math.ceil(balanceCents / monthlyCents) : 0;

  if (installmentCount > 1200) {
    return { error: "installment" };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const saleItems: {
        productId: string;
        productBrandId: string | null;
        productName: string;
        quantity: number;
        unitPrice: ReturnType<typeof fromCents>;
        lineTotal: ReturnType<typeof fromCents>;
      }[] = [];

      // Validate and deduct stock for every selected item.
      for (const item of items) {
        const product = await tx.product.findFirst({
          where: {
            id: item.productId,
            isActive: true,
          },
          select: {
            id: true,
            name: true,
            stockQuantity: true,
            productBrands: {
              where: {
                isActive: true,
              },
              select: {
                id: true,
                stockQuantity: true,
              },
            },
          },
        });

        if (!product) {
          throw new Error("PRODUCT_UNAVAILABLE");
        }

        let selectedProductBrandId: string | null = null;

        if (product.productBrands.length > 0) {
          if (!item.productBrandId) {
            throw new Error("PRODUCT_BRAND_REQUIRED");
          }

          const productBrand = product.productBrands.find(
            (option) => option.id === item.productBrandId,
          );

          if (!productBrand) {
            throw new Error("PRODUCT_BRAND_UNAVAILABLE");
          }

          const stockUpdate = await tx.productBrand.updateMany({
            where: {
              id: productBrand.id,
              productId: product.id,
              isActive: true,
              stockQuantity: {
                gte: item.quantity,
              },
            },
            data: {
              stockQuantity: {
                decrement: item.quantity,
              },
            },
          });

          if (stockUpdate.count !== 1) {
            throw new Error("INSUFFICIENT_STOCK");
          }

          selectedProductBrandId = productBrand.id;
        } else {
          if (item.productBrandId) {
            throw new Error("PRODUCT_BRAND_UNAVAILABLE");
          }

          const stockUpdate = await tx.product.updateMany({
            where: {
              id: product.id,
              isActive: true,
              stockQuantity: {
                gte: item.quantity,
              },
            },
            data: {
              stockQuantity: {
                decrement: item.quantity,
              },
            },
          });

          if (stockUpdate.count !== 1) {
            throw new Error("INSUFFICIENT_STOCK");
          }
        }

        saleItems.push({
          productId: product.id,
          productBrandId: selectedProductBrandId,
          productName: product.name,
          quantity: item.quantity,
          unitPrice: fromCents(item.unitPriceCents),
          lineTotal: fromCents(item.lineTotalCents),
        });
      }

      // Validate sales employee.
      if (salesEmployeeId) {
        const employee = await tx.employee.findFirst({
          where: {
            id: salesEmployeeId,
            isActive: true,
          },
          select: {
            id: true,
          },
        });

        if (!employee) {
          throw new Error("EMPLOYEE_UNAVAILABLE");
        }
      }

      // Find an existing customer using NIC and mobile.
      const existingByNic = await tx.customer.findUnique({
        where: { nic },
        select: {
          id: true,
          mobile: true,
        },
      });

      const existingByMobile = await tx.customer.findUnique({
        where: { mobile },
        select: {
          id: true,
          nic: true,
        },
      });

      if (
        (existingByNic && existingByNic.mobile !== mobile) ||
        (existingByMobile && existingByMobile.nic !== nic) ||
        (existingByNic &&
          existingByMobile &&
          existingByNic.id !== existingByMobile.id)
      ) {
        throw new Error("CUSTOMER_CONFLICT");
      }

      let customerId: string;

      if (existingByNic) {
        customerId = existingByNic.id;
      } else if (existingByMobile) {
        customerId = existingByMobile.id;
      } else {
        const customer = await tx.customer.create({
          data: {
            fullName,
            nic,
            mobile,
            additionalMobile: additionalMobile || null,
            address,
            area: area || null,
            guarantorDetails: guarantorDetails || null,
            notes: notes || null,
          },
          select: {
            id: true,
          },
        });

        customerId = customer.id;
      }

      // Create one sale containing all selected products.
      await tx.sale.create({
        data: {
          billNumber,
          customerId,
          salesEmployeeId: salesEmployeeId || null,
          saleDate,
          totalAmount: fromCents(totalCents),
          advancePayment: fromCents(advanceCents),
          notes: notes || null,
          status: balanceCents === 0 ? "PAID" : "ACTIVE",
          items: {
            create: saleItems,
          },
          installments: {
            create: Array.from({ length: installmentCount }, (_, index) => {
              const installmentNumber = index + 1;

              const amountCents = Math.min(
                monthlyCents,
                balanceCents - index * monthlyCents,
              );

              return {
                installmentNumber,
                dueDate: addMonthsUTC(firstInstallmentDate, index),
                scheduledAmount: fromCents(amountCents),
              };
            }),
          },
        },
      });
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "CUSTOMER_CONFLICT") {
        return { error: "customer-conflict" };
      }

      if (error.message === "PRODUCT_UNAVAILABLE") {
        return { error: "product" };
      }

      if (error.message === "PRODUCT_BRAND_REQUIRED") {
        return { error: "product-brand-required" };
      }

      if (error.message === "PRODUCT_BRAND_UNAVAILABLE") {
        return { error: "product-brand" };
      }

      if (error.message === "INSUFFICIENT_STOCK") {
        return { error: "stock" };
      }

      if (error.message === "EMPLOYEE_UNAVAILABLE") {
        return { error: "employee" };
      }

      if ("code" in error && error.code === "P2002") {
        return { error: "duplicate" };
      }
    }

    console.error("Sale registration failed.");
    return { error: "failed" };
  }

  revalidatePath("/customers");
  revalidatePath("/customers/register");

  redirect("/customers/register?created=1");
}
