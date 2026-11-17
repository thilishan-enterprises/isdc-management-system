"use server";
import { prisma } from "@/lib/prisma";
import { createHmac, timingSafeEqual } from "node:crypto";
import { requireUser } from "@/lib/auth-guards";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  ADDITIONAL_MOBILE_ERROR,
  isValidAdditionalMobile,
  isValidNic,
  isValidPrimaryMobile,
  NIC_ERROR,
  normalizeNic,
  normalizePhone,
  PRIMARY_MOBILE_ERROR,
  validateCustomerContact,
} from "@/lib/customer-contact";
import { customerPhoneOwnershipWhere } from "@/lib/customer-ownership";

export type CustomerRegistrationField =
  | "fullName"
  | "nic"
  | "mobile"
  | "additionalMobile"
  | "address"
  | "area"
  | "guarantorDetails"
  | "notes";

export type CustomerRegistrationState = {
  fieldErrors?: Partial<Record<CustomerRegistrationField, string>>;
  formError?: string;
};

class CustomerRegistrationConflict extends Error {
  constructor(
    readonly fieldErrors: NonNullable<
      CustomerRegistrationState["fieldErrors"]
    >,
  ) {
    super("CUSTOMER_REGISTRATION_CONFLICT");
  }
}

function getUniqueCustomerField(
  error: unknown,
): "nic" | "mobile" | "phone" | null {
  if (
    typeof error !== "object" ||
    error === null ||
    !("code" in error) ||
    error.code !== "P2002"
  ) {
    return null;
  }

  const meta = "meta" in error ? error.meta : undefined;
  const target =
    typeof meta === "object" && meta !== null && "target" in meta
      ? meta.target
      : undefined;
  const driverAdapterError =
    typeof meta === "object" && meta !== null && "driverAdapterError" in meta
      ? meta.driverAdapterError
      : undefined;
  const cause =
    typeof driverAdapterError === "object" &&
    driverAdapterError !== null &&
    "cause" in driverAdapterError
      ? driverAdapterError.cause
      : undefined;
  const constraint =
    typeof cause === "object" && cause !== null && "constraint" in cause
      ? cause.constraint
      : undefined;
  const fields =
    typeof constraint === "object" &&
    constraint !== null &&
    "fields" in constraint
      ? constraint.fields
      : undefined;
  const targetText = [target, constraint, fields]
    .flatMap((value) =>
      Array.isArray(value) ? value : typeof value === "string" ? [value] : [],
    )
    .join(" ")
    .toLowerCase();

  if (targetText.includes("nic")) return "nic";
  if (
    targetText.includes("customerphone") ||
    targetText.includes("normalizedphone")
  )
    return "phone";
  if (targetText.includes("mobile")) return "mobile";

  return null;
}

function hasPrismaCode(error: unknown, code: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

export async function createCustomer(
  _previousState: CustomerRegistrationState,
  formData: FormData,
): Promise<CustomerRegistrationState> {
  await requireUser();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const nic = normalizeNic(String(formData.get("nic") ?? ""));
  const mobile = normalizePhone(String(formData.get("mobile") ?? ""));
  const additionalMobile = normalizePhone(
    String(formData.get("additionalMobile") ?? ""),
  );
  const address = String(formData.get("address") ?? "").trim();
  const area = String(formData.get("area") ?? "").trim();
  const guarantorDetails = String(
    formData.get("guarantorDetails") ?? "",
  ).trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const fieldErrors: CustomerRegistrationState["fieldErrors"] = {};

  if (fullName.length < 2 || fullName.length > 150) {
    fieldErrors.fullName = "Enter a customer name between 2 and 150 characters.";
  }
  if (!isValidNic(nic)) {
    fieldErrors.nic = NIC_ERROR;
  }
  if (!isValidPrimaryMobile(mobile)) {
    fieldErrors.mobile = PRIMARY_MOBILE_ERROR;
  }
  if (!isValidAdditionalMobile(additionalMobile)) {
    fieldErrors.additionalMobile = ADDITIONAL_MOBILE_ERROR;
  }
  if (additionalMobile && additionalMobile === mobile) {
    fieldErrors.additionalMobile =
      "Primary and additional mobile numbers must be different.";
  }
  if (address.length < 3 || address.length > 500) {
    fieldErrors.address = "Enter an address between 3 and 500 characters.";
  }
  if (area.length > 150) {
    fieldErrors.area = "Collection area must be 150 characters or fewer.";
  }
  if (guarantorDetails.length > 2000) {
    fieldErrors.guarantorDetails =
      "Guarantor details must be 2,000 characters or fewer.";
  }
  if (notes.length > 2000) {
    fieldErrors.notes = "Notes must be 2,000 characters or fewer.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await prisma.$transaction(
          async (tx) => {
            const phoneNumbers = [mobile, additionalMobile].filter(Boolean);
            const [nicOwner, phoneOwners] =
              await Promise.all([
                tx.customer.findUnique({
                  where: { nic },
                  select: { id: true },
                }),
                tx.customerPhone.findMany({
                  where: customerPhoneOwnershipWhere(phoneNumbers),
                  select: { normalizedPhone: true },
                }),
              ]);
            const ownedPhones = new Set(
              phoneOwners.map((owner) => owner.normalizedPhone),
            );

            const duplicateErrors: NonNullable<
              CustomerRegistrationState["fieldErrors"]
            > = {};

            if (nicOwner) {
              duplicateErrors.nic = "This NIC number is already registered.";
            }
            if (ownedPhones.has(mobile)) {
              duplicateErrors.mobile =
                "This mobile number is already registered.";
            }
            if (additionalMobile && ownedPhones.has(additionalMobile)) {
              duplicateErrors.additionalMobile =
                "This additional mobile number is already registered.";
            }
            if (Object.keys(duplicateErrors).length > 0) {
              throw new CustomerRegistrationConflict(duplicateErrors);
            }

            await tx.customer.create({
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
          },
          { isolationLevel: "Serializable" },
        );
        break;
      } catch (error: unknown) {
        if (hasPrismaCode(error, "P2034") && attempt < 2) continue;
        throw error;
      }
    }
  } catch (error: unknown) {
    if (error instanceof CustomerRegistrationConflict) {
      return { fieldErrors: error.fieldErrors };
    }
    const duplicateField = getUniqueCustomerField(error);

    if (duplicateField === "nic") {
      return {
        fieldErrors: { nic: "This NIC number is already registered." },
      };
    }
    if (duplicateField === "mobile") {
      return {
        fieldErrors: { mobile: "This mobile number is already registered." },
      };
    }
    if (duplicateField === "phone") {
      return {
        formError:
          "A primary or additional mobile number is already assigned to another customer.",
      };
    }
    if (hasPrismaCode(error, "P2002")) {
      return {
        formError:
          "A customer with this NIC or mobile number is already registered.",
      };
    }

    console.error("Customer creation failed.");
    return {
      formError: "Unable to register the customer. Please try again.",
    };
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
  const session = await requireUser();
  const billNumber = String(formData.get("billNumber") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const contactValidation = validateCustomerContact({
    nic: String(formData.get("nic") ?? ""),
    mobile: String(formData.get("mobile") ?? ""),
    additionalMobile: String(formData.get("additionalMobile") ?? ""),
  });
  const { nic, mobile, additionalMobile } = contactValidation.normalized;
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
    !contactValidation.nicError &&
    !contactValidation.mobileError &&
    address.length >= 3 &&
    address.length <= 500 &&
    area.length <= 150 &&
    !contactValidation.additionalMobileError &&
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
  const verificationToken = String(formData.get("verificationToken") ?? "");
  const selectedCustomerId = String(formData.get("selectedCustomerId") ?? "");
  const verified = verifyRecordToken(verificationToken, {
    userId: session.user.id,
    billNumber,
    fullName,
    address,
    nic,
    mobile,
    additionalMobile,
    selectedCustomerId,
  });
  if (!verified) return { error: "verification" };

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
    for (let attempt = 0; attempt < 3; attempt += 1) {
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
      // The verified identity is authoritative; do not infer a customer from
      // a changed NIC/mobile. Existing customer master data stays unchanged.
      let customerId: string;
      if (selectedCustomerId) {
        const selected = await tx.customer.findUnique({
          where: { id: selectedCustomerId },
          select: { id: true },
        });
        if (!selected) throw new Error("CUSTOMER_UNAVAILABLE");
        customerId = selected.id;
      } else {
        // Never create a second master record with an already-owned unique
        // identifier. Staff must select the existing identity or resolve it.
        const [nicOwner, phoneOwner] = await Promise.all([
          tx.customer.findUnique({ where: { nic }, select: { id: true } }),
          tx.customerPhone.findFirst({
            where: customerPhoneOwnershipWhere([mobile, additionalMobile]),
            select: { id: true },
          }),
        ]);
        if (nicOwner || phoneOwner) throw new Error("CUSTOMER_CONFLICT");
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
          select: { id: true },
        });
        customerId = customer.id;
      }

      const existingBill = await tx.sale.findFirst({
        where: { billNumber: { equals: billNumber, mode: "insensitive" } },
        select: { id: true },
      });
      if (existingBill) throw new Error("DUPLICATE_BILL");

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
          customerSnapshot: {
            create: {
              fullName,
              nic,
              mobile,
              additionalMobile: additionalMobile || null,
              address,
              area: area || null,
              guarantorDetails: guarantorDetails || null,
            },
          },
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
        }, {
          isolationLevel: "Serializable",
          maxWait: 5000,
          timeout: 15000,
        });
        break;
      } catch (error) {
        if (hasPrismaCode(error, "P2034") && attempt < 2) continue;
        throw error;
      }
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "CUSTOMER_UNAVAILABLE") {
        return { error: "verification" };
      }
      if (error.message === "DUPLICATE_BILL") {
        return { error: "duplicate" };
      }
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
      if (getUniqueCustomerField(error)) {
        return { error: "customer-conflict" };
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
export type CustomerRecordCheckInput = {
  billNumber: string;
  fullName: string;
  address: string;
  nic: string;
  mobile: string;
  additionalMobile: string;
};
export type CustomerRecordDetails = {
  fullName: string;
  nic: string;
  mobile: string;
  additionalMobile: string | null;
  address: string;
  area: string | null;
  guarantorDetails: string | null;
};
export type CustomerRecordMatch = {
  customerId: string;
  currentDetails: CustomerRecordDetails;
  matchedBy: string[];
  totalSales: number;
  hasMoreSales: boolean;
  sales: {
    id: string;
    billNumber: string;
    saleDate: string;
    totalAmount: string;
    status: string;
    details: CustomerRecordDetails;
    detailsSource: "snapshot" | "legacy";
  }[];
};
export type CustomerRecordCheckResult = {
  success: boolean;
  error?: string;
  billNumberTaken: boolean;
  hasMoreMatches: boolean;
  matches: CustomerRecordMatch[];
};
export async function checkSaleCustomerRecords(
  rawInput: CustomerRecordCheckInput,
): Promise<CustomerRecordCheckResult> {
  await requireUser();
  const emptyResult: CustomerRecordCheckResult = {
    success: false,
    billNumberTaken: false,
    hasMoreMatches: false,
    matches: [],
  };
  const billNumber = String(rawInput.billNumber ?? "").trim();
  const fullName = String(rawInput.fullName ?? "").trim();
  const address = String(rawInput.address ?? "").trim();
  const contactValidation = validateCustomerContact({
    nic: String(rawInput.nic ?? ""),
    mobile: String(rawInput.mobile ?? ""),
    additionalMobile: String(rawInput.additionalMobile ?? ""),
  });
  const { nic, mobile, additionalMobile } = contactValidation.normalized;
  if (
    !/^[A-Za-z0-9/-]{1,50}$/.test(billNumber) ||
    fullName.length < 2 ||
    fullName.length > 150 ||
    address.length < 3 ||
    address.length > 500 ||
    Boolean(contactValidation.nicError) ||
    Boolean(contactValidation.mobileError) ||
    Boolean(contactValidation.additionalMobileError)
  ) {
    return {
      ...emptyResult,
      error: "Complete the customer details with valid information.",
    };
  }
  const phoneNumbers = Array.from(
    new Set([mobile, additionalMobile].filter(Boolean)),
  );
  const SCAN_LIMIT = 101;
  const CUSTOMER_LIMIT = 20;
  const SALES_LIMIT = 30;
  // Prioritize exact identifiers over name/address matches.
  const [
    billMatch,
    currentIdentifierMatches,
    historicalIdentifierMatches,
    currentTextMatches,
    historicalTextMatches,
  ] = await Promise.all([
    prisma.sale.findFirst({
      where: {
        billNumber: {
          equals: billNumber,
          mode: "insensitive",
        },
      },
      select: {
        customerId: true,
      },
    }),
    prisma.customer.findMany({
      where: {
        OR: [
          { nic },
          { mobile: { in: phoneNumbers } },
          { additionalMobile: { in: phoneNumbers } },
        ],
      },
      select: {
        id: true,
        fullName: true,
        nic: true,
        mobile: true,
        additionalMobile: true,
        address: true,
      },
      orderBy: { createdAt: "desc" },
      take: SCAN_LIMIT,
    }),
    prisma.saleCustomerSnapshot.findMany({
      where: {
        OR: [
          { nic },
          { mobile: { in: phoneNumbers } },
          { additionalMobile: { in: phoneNumbers } },
        ],
      },
      select: {
        fullName: true,
        nic: true,
        mobile: true,
        additionalMobile: true,
        address: true,
        sale: {
          select: {
            customerId: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: SCAN_LIMIT,
    }),
    prisma.customer.findMany({
      where: {
        OR: [
          {
            fullName: {
              contains: fullName,
              mode: "insensitive",
            },
          },
          {
            address: {
              contains: address,
              mode: "insensitive",
            },
          },
        ],
      },
      select: {
        id: true,
        fullName: true,
        nic: true,
        mobile: true,
        additionalMobile: true,
        address: true,
      },
      orderBy: { createdAt: "desc" },
      take: SCAN_LIMIT,
    }),
    prisma.saleCustomerSnapshot.findMany({
      where: {
        OR: [
          {
            fullName: {
              contains: fullName,
              mode: "insensitive",
            },
          },
          {
            address: {
              contains: address,
              mode: "insensitive",
            },
          },
        ],
      },
      select: {
        fullName: true,
        nic: true,
        mobile: true,
        additionalMobile: true,
        address: true,
        sale: {
          select: {
            customerId: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: SCAN_LIMIT,
    }),
  ]);
  // Collect customer identities, not duplicate sale rows.
  const candidateIds = Array.from(
    new Set([
      ...(billMatch ? [billMatch.customerId] : []),
      ...currentIdentifierMatches.map((item) => item.id),
      ...historicalIdentifierMatches.map((item) => item.sale.customerId),
      ...currentTextMatches.map((item) => item.id),
      ...historicalTextMatches.map((item) => item.sale.customerId),
    ]),
  );
  const hasMoreMatches =
    candidateIds.length > CUSTOMER_LIMIT ||
    currentIdentifierMatches.length === SCAN_LIMIT ||
    historicalIdentifierMatches.length === SCAN_LIMIT ||
    currentTextMatches.length === SCAN_LIMIT ||
    historicalTextMatches.length === SCAN_LIMIT;
  const selectedIds = candidateIds.slice(0, CUSTOMER_LIMIT);
  if (selectedIds.length === 0) {
    return {
      success: true,
      billNumberTaken: false,
      hasMoreMatches: false,
      matches: [],
    };
  }
  // Record exactly why each customer appeared in the results.
  const reasons = new Map<string, Set<string>>();
  function addReason(customerId: string, reason: string) {
    const existing = reasons.get(customerId) ?? new Set<string>();
    existing.add(reason);
    reasons.set(customerId, existing);
  }
  type SearchableDetails = Pick<
    CustomerRecordDetails,
    "fullName" | "nic" | "mobile" | "additionalMobile" | "address"
  >;
  function collectReasons(
    customerId: string,
    details: SearchableDetails,
    historical: boolean,
  ) {
    const prefix = historical ? "Historical" : "Current";
    if (details.nic.toUpperCase() === nic) {
      addReason(customerId, `${prefix} NIC`);
    }
    if (phoneNumbers.includes(details.mobile)) {
      addReason(customerId, `${prefix} primary mobile`);
    }
    if (
      details.additionalMobile &&
      phoneNumbers.includes(details.additionalMobile)
    ) {
      addReason(customerId, `${prefix} additional mobile`);
    }
    if (details.fullName.toLowerCase().includes(fullName.toLowerCase())) {
      addReason(customerId, `${prefix} customer name`);
    }
    if (details.address.toLowerCase().includes(address.toLowerCase())) {
      addReason(customerId, `${prefix} address`);
    }
  }
  for (const record of [...currentIdentifierMatches, ...currentTextMatches]) {
    collectReasons(record.id, record, false);
  }
  for (const record of [
    ...historicalIdentifierMatches,
    ...historicalTextMatches,
  ]) {
    collectReasons(record.sale.customerId, record, true);
  }
  if (billMatch) {
    addReason(billMatch.customerId, "Existing bill number");
  }
  const customers = await prisma.customer.findMany({
    where: {
      id: { in: selectedIds },
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
      _count: {
        select: {
          sales: true,
        },
      },
      sales: {
        orderBy: [{ saleDate: "desc" }, { createdAt: "desc" }],
        take: SALES_LIMIT,
        select: {
          id: true,
          billNumber: true,
          saleDate: true,
          totalAmount: true,
          status: true,
          customerSnapshot: {
            select: {
              fullName: true,
              nic: true,
              mobile: true,
              additionalMobile: true,
              address: true,
              area: true,
              guarantorDetails: true,
            },
          },
        },
      },
    },
  });
  function serializeDetails(
    details: CustomerRecordDetails,
  ): CustomerRecordDetails {
    return {
      fullName: details.fullName,
      nic: details.nic,
      mobile: details.mobile,
      additionalMobile: details.additionalMobile,
      address: details.address,
      area: details.area,
      guarantorDetails: details.guarantorDetails,
    };
  }
  const matches: CustomerRecordMatch[] = customers
    .map((customer) => ({
      customerId: customer.id,
      currentDetails: serializeDetails(customer),
      matchedBy: Array.from(reasons.get(customer.id) ?? []),
      totalSales: customer._count.sales,
      hasMoreSales: customer._count.sales > SALES_LIMIT,
      sales: customer.sales.map((sale) => ({
        id: sale.id,
        billNumber: sale.billNumber,
        saleDate: sale.saleDate.toISOString().slice(0, 10),
        totalAmount: String(sale.totalAmount),
        status: sale.status,
        details: serializeDetails(sale.customerSnapshot ?? customer),
        detailsSource: sale.customerSnapshot
          ? ("snapshot" as const)
          : ("legacy" as const),
      })),
    }))
    .sort(
      (a, b) =>
        selectedIds.indexOf(a.customerId) - selectedIds.indexOf(b.customerId),
    );
  return {
    success: true,
    billNumberTaken: Boolean(billMatch),
    hasMoreMatches,
    matches,
  };
}

// A confirmation is bound to the logged-in user, the five required fields,
// the optional additional phone, and the explicitly chosen customer identity.
// Configure AUTH_SECRET (or NEXTAUTH_SECRET) consistently on all app instances.
type VerifiedRecord = CustomerRecordCheckInput & {
  userId: string;
  selectedCustomerId: string;
};

function recordSecret(): string {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("A secure AUTH_SECRET (32+ characters) is required.");
  }
  return secret;
}

function normalizeVerifiedRecord(input: VerifiedRecord): VerifiedRecord {
  return {
    userId: input.userId,
    selectedCustomerId: input.selectedCustomerId,
    billNumber: input.billNumber.trim(),
    fullName: input.fullName.trim(),
    address: input.address.trim(),
    nic: normalizeNic(input.nic),
    mobile: input.mobile.trim(),
    additionalMobile: input.additionalMobile.trim(),
  };
}

function signRecord(payload: string): string {
  return createHmac("sha256", recordSecret()).update(payload).digest("hex");
}

function verifyRecordToken(token: string, input: VerifiedRecord): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 2 || !/^[a-f0-9]{64}$/.test(parts[1])) return false;
    const expected = Buffer.from(signRecord(parts[0]), "hex");
    const actual = Buffer.from(parts[1], "hex");
    if (!timingSafeEqual(expected, actual)) return false;
    const payload = JSON.parse(
      Buffer.from(parts[0], "base64url").toString("utf8"),
    );
    if (
      payload.expiresAt < Date.now() ||
      payload.expiresAt > Date.now() + 10 * 60_000
    )
      return false;
    return (
      JSON.stringify(payload.record) ===
      JSON.stringify(normalizeVerifiedRecord(input))
    );
  } catch {
    return false;
  }
}

export type ConfirmRecordChoiceInput = {
  entered: CustomerRecordCheckInput;
  selectedCustomerId: string | null;
  details: CustomerRecordDetails | null;
};

export async function confirmSaleCustomerRecord(
  input: ConfirmRecordChoiceInput,
): Promise<{ success: boolean; token?: string; error?: string }> {
  const session = await requireUser();
  const lookup = await checkSaleCustomerRecords(input.entered);
  if (!lookup.success || lookup.billNumberTaken || lookup.hasMoreMatches) {
    return {
      success: false,
      error: lookup.error ?? "Record check must be completed again.",
    };
  }
  const selectedCustomerId = input.selectedCustomerId ?? "";
  const selected = lookup.matches.find(
    (match) => match.customerId === selectedCustomerId,
  );
  if (selectedCustomerId && !selected) {
    return {
      success: false,
      error: "Selected customer is not in the verified results.",
    };
  }
  if (input.details && !selected) {
    return {
      success: false,
      error: "Choose an existing customer before copying details.",
    };
  }
  if (input.details && selected) {
    const candidates = [
      selected.currentDetails,
      ...selected.sales.map((sale) => sale.details),
    ];
    if (
      !candidates.some(
        (details) => JSON.stringify(details) === JSON.stringify(input.details),
      )
    ) {
      return {
        success: false,
        error:
          "Selected historical details are no longer available. Check again.",
      };
    }
  }
  const effective = input.details ?? input.entered;
  const record = normalizeVerifiedRecord({
    userId: session.user.id,
    selectedCustomerId,
    billNumber: input.entered.billNumber,
    fullName: effective.fullName,
    address: effective.address,
    nic: effective.nic,
    mobile: effective.mobile,
    additionalMobile: effective.additionalMobile ?? "",
  });
  // Validate the effective details too, not only the originally entered values.
  const contactValidation = validateCustomerContact({
    nic: record.nic,
    mobile: record.mobile,
    additionalMobile: record.additionalMobile,
  });
  if (
    !/^[A-Za-z0-9/-]{1,50}$/.test(record.billNumber) ||
    record.fullName.length < 2 ||
    record.fullName.length > 150 ||
    record.address.length < 3 ||
    record.address.length > 500 ||
    Boolean(contactValidation.nicError) ||
    Boolean(contactValidation.mobileError) ||
    Boolean(contactValidation.additionalMobileError)
  )
    return {
      success: false,
      error: "Selected customer details do not pass validation.",
    };

  const payload = Buffer.from(
    JSON.stringify({
      record,
      expiresAt: Date.now() + 10 * 60_000,
    }),
  ).toString("base64url");
  return { success: true, token: `${payload}.${signRecord(payload)}` };
}
