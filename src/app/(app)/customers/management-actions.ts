"use server";

import bcrypt from "bcryptjs";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-guards";
import { revalidatePath } from "next/cache";

export type BlockedCustomer = {
  id: string;
  name: string;
  sales: {
    billNumber: string;
    status: string;
  }[];
};

export type DeleteCustomersResult = {
  success: boolean;
  deletedCount: number;
  blocked: BlockedCustomer[];
  error?: string;
};

type DeleteCustomersInput = {
  customerIds: string[];
  adminPassword?: string;
};

async function authorizeCustomerMutation(userId: string, password?: string) {
  const actor = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      isActive: true,
      employee: {
        select: { isActive: true },
      },
    },
  });

  if (
    !actor ||
    !actor.isActive ||
    (actor.employee && !actor.employee.isActive)
  ) {
    return null;
  }

  if (actor.role === "ADMIN") {
    return {
      actorId: actor.id,
      approvedById: actor.id,
    };
  }

  if (!password || password.length > 1024) {
    return null;
  }

  const admins = await prisma.user.findMany({
    where: {
      role: "ADMIN",
      isActive: true,
      OR: [{ employeeId: null }, { employee: { isActive: true } }],
    },
    select: {
      id: true,
      passwordHash: true,
    },
  });

  for (const admin of admins) {
    if (await bcrypt.compare(password, admin.passwordHash)) {
      return {
        actorId: actor.id,
        approvedById: admin.id,
      };
    }
  }

  return null;
}

export async function deleteCustomers(
  input: DeleteCustomersInput,
): Promise<DeleteCustomersResult> {
  const session = await requireUser();

  const customerIds = Array.from(
    new Set(
      (Array.isArray(input.customerIds) ? input.customerIds : []).filter(
        (id): id is string =>
          typeof id === "string" && id.length > 0 && id.length <= 100,
      ),
    ),
  );

  if (customerIds.length === 0 || customerIds.length > 100) {
    return {
      success: false,
      deletedCount: 0,
      blocked: [],
      error: "Select between 1 and 100 customers.",
    };
  }

  const authorization = await authorizeCustomerMutation(
    session.user.id,
    input.adminPassword,
  );

  if (!authorization) {
    return {
      success: false,
      deletedCount: 0,
      blocked: [],
      error: "Administrator authorization failed.",
    };
  }

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const customers = await tx.customer.findMany({
          where: {
            id: { in: customerIds },
          },
          select: {
            id: true,
            fullName: true,
            nic: true,
            mobile: true,
            sales: {
              select: {
                billNumber: true,
                status: true,
              },
              orderBy: {
                createdAt: "desc",
              },
            },
          },
        });

        const blocked: BlockedCustomer[] = customers
          .filter((customer) => customer.sales.length > 0)
          .map((customer) => ({
            id: customer.id,
            name: customer.fullName,
            sales: customer.sales.map((sale) => ({
              billNumber: sale.billNumber,
              status: sale.status,
            })),
          }));

        const eligible = customers.filter(
          (customer) => customer.sales.length === 0,
        );

        const deletedIds: string[] = [];

        for (const customer of eligible) {
          const deleted = await tx.customer.deleteMany({
            where: {
              id: customer.id,
              sales: { none: {} },
            },
          });

          if (deleted.count !== 1) {
            throw new Error("CUSTOMER_CHANGED");
          }

          deletedIds.push(customer.id);

          await tx.auditLog.create({
            data: {
              userId: authorization.actorId,
              action: "CUSTOMER_DELETED",
              entityType: "Customer",
              entityId: customer.id,
              reason:
                authorization.actorId === authorization.approvedById
                  ? "Deleted by administrator"
                  : "Deleted with administrator authorization",
              beforeData: {
                fullName: customer.fullName,
                nic: customer.nic,
                mobile: customer.mobile,
                approvedByUserId: authorization.approvedById,
              },
            },
          });
        }

        return {
          deletedCount: deletedIds.length,
          blocked,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 15000,
      },
    );

    revalidatePath("/customers");

    return {
      success: true,
      deletedCount: result.deletedCount,
      blocked: result.blocked,
    };
  } catch (error) {
    console.error("Customer deletion failed:", error);

    return {
      success: false,
      deletedCount: 0,
      blocked: [],
      error:
        "Deletion could not be completed. Please retry. No customers were deleted by this operation.",
    };
  }
}

export type CustomerDetails = {
  id: string;
  fullName: string;
  nic: string;
  mobile: string;
  additionalMobile: string;
  address: string;
  area: string;
  guarantorDetails: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  totalSales: number;
};

export type CustomerEditInput = {
  id: string;
  fullName: string;
  nic: string;
  mobile: string;
  additionalMobile: string;
  address: string;
  area: string;
  guarantorDetails: string;
  notes: string;
  adminPassword?: string;
};

export type CustomerEditResult = {
  success: boolean;
  error?: string;
};

export async function getCustomerDetails(
  customerId: string,
): Promise<CustomerDetails | null> {
  const session = await requireUser();

  // Check the current database account, not only
  // the role stored in the JWT.
  const actor = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      isActive: true,
      employee: { select: { isActive: true } },
    },
  });

  if (!actor?.isActive || (actor.employee && !actor.employee.isActive)) {
    return null;
  }

  if (
    typeof customerId !== "string" ||
    !customerId ||
    customerId.length > 100
  ) {
    return null;
  }

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      _count: {
        select: { sales: true },
      },
    },
  });

  if (!customer) return null;

  return {
    id: customer.id,
    fullName: customer.fullName,
    nic: customer.nic,
    mobile: customer.mobile,
    additionalMobile: customer.additionalMobile ?? "",
    address: customer.address,
    area: customer.area ?? "",
    guarantorDetails: customer.guarantorDetails ?? "",
    notes: customer.notes ?? "",
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
    totalSales: customer._count.sales,
  };
}

export async function updateCustomer(
  input: CustomerEditInput,
): Promise<CustomerEditResult> {
  const session = await requireUser();

  if (!input || typeof input !== "object") {
    return { success: false, error: "Invalid request." };
  }

  const id = typeof input.id === "string" ? input.id.trim() : "";
  const fullName =
    typeof input.fullName === "string" ? input.fullName.trim() : "";
  const nic =
    typeof input.nic === "string" ? input.nic.trim().toUpperCase() : "";
  const mobile = typeof input.mobile === "string" ? input.mobile.trim() : "";
  const additionalMobile =
    typeof input.additionalMobile === "string"
      ? input.additionalMobile.trim()
      : "";
  const address = typeof input.address === "string" ? input.address.trim() : "";
  const area = typeof input.area === "string" ? input.area.trim() : "";
  const guarantorDetails =
    typeof input.guarantorDetails === "string"
      ? input.guarantorDetails.trim()
      : "";
  const notes = typeof input.notes === "string" ? input.notes.trim() : "";

  if (
    !id ||
    id.length > 100 ||
    fullName.length < 2 ||
    fullName.length > 150 ||
    !/^[A-Z0-9-]{5,20}$/.test(nic) ||
    !/^[0-9]{7,10}$/.test(mobile) ||
    (additionalMobile !== "" && !/^[0-9]{7,10}$/.test(additionalMobile)) ||
    address.length < 3 ||
    address.length > 500 ||
    area.length > 150 ||
    guarantorDetails.length > 2000 ||
    notes.length > 2000
  ) {
    return {
      success: false,
      error: "Please enter valid customer details.",
    };
  }

  const authorization = await authorizeCustomerMutation(
    session.user.id,
    input.adminPassword,
  );

  if (!authorization) {
    return {
      success: false,
      error: "Administrator authorization failed.",
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.customer.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new Error("CUSTOMER_NOT_FOUND");
      }

      const duplicate = await tx.customer.findFirst({
        where: {
          id: { not: id },
          OR: [{ nic }, { mobile }],
        },
        select: { id: true },
      });

      if (duplicate) {
        throw new Error("DUPLICATE_CUSTOMER");
      }

      const updated = await tx.customer.update({
        where: { id },
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

      await tx.auditLog.create({
        data: {
          userId: authorization.actorId,
          action: "CUSTOMER_UPDATED",
          entityType: "Customer",
          entityId: id,
          reason:
            authorization.actorId === authorization.approvedById
              ? "Updated by administrator"
              : "Updated with administrator authorization",
          beforeData: {
            fullName: existing.fullName,
            nic: existing.nic,
            mobile: existing.mobile,
            additionalMobile: existing.additionalMobile,
            address: existing.address,
            area: existing.area,
            guarantorDetails: existing.guarantorDetails,
            notes: existing.notes,
          },
          afterData: {
            fullName: updated.fullName,
            nic: updated.nic,
            mobile: updated.mobile,
            additionalMobile: updated.additionalMobile,
            address: updated.address,
            area: updated.area,
            guarantorDetails: updated.guarantorDetails,
            notes: updated.notes,
            approvedByUserId: authorization.approvedById,
          },
        },
      });
    });

    revalidatePath("/customers");

    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "CUSTOMER_NOT_FOUND") {
        return {
          success: false,
          error: "Customer no longer exists.",
        };
      }

      if (
        error.message === "DUPLICATE_CUSTOMER" ||
        ("code" in error && error.code === "P2002")
      ) {
        return {
          success: false,
          error: "Another customer already uses this NIC or mobile number.",
        };
      }
    }

    console.error("Customer update failed.");

    return {
      success: false,
      error: "Unable to update the customer. Please try again.",
    };
  }
}
