"use server";

import bcrypt from "bcryptjs";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-guards";
import { revalidatePath } from "next/cache";
import { validateCustomerContact } from "@/lib/customer-contact";
import { customerPhoneOwnershipWhere } from "@/lib/customer-ownership";
import {
  ADMIN_APPROVAL_ATTEMPT,
  ADMIN_APPROVAL_ATTEMPT_LIMIT,
  ADMIN_APPROVAL_FAILED,
  ADMIN_APPROVAL_SUCCEEDED,
  approvalWindowStart,
} from "@/lib/approval-throttle";

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

async function reserveAdminApprovalAttempt(userId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`customer-admin-approval:${userId}`}))`;
    const attempts = await tx.auditLog.count({
      where: {
        userId,
        action: { in: [ADMIN_APPROVAL_ATTEMPT, ADMIN_APPROVAL_FAILED] },
        createdAt: { gte: approvalWindowStart() },
      },
    });
    if (attempts >= ADMIN_APPROVAL_ATTEMPT_LIMIT) return null;
    return tx.auditLog.create({
      data: {
        userId,
        action: ADMIN_APPROVAL_ATTEMPT,
        entityType: "Security",
        entityId: userId,
        reason: "Customer mutation administrator approval attempted",
      },
      select: { id: true },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function finalizeAdminApprovalAttempt(id: string, userId: string, approved: boolean) {
  await prisma.auditLog.updateMany({
    where: { id, userId, action: ADMIN_APPROVAL_ATTEMPT },
    data: {
      action: approved ? ADMIN_APPROVAL_SUCCEEDED : ADMIN_APPROVAL_FAILED,
      reason: approved
        ? "Customer mutation administrator approval succeeded"
        : "Customer mutation administrator approval failed",
    },
  });
}

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

  if (!password) {
    return null;
  }

  const attempt = await reserveAdminApprovalAttempt(actor.id).catch(() => null);
  if (!attempt) return null;
  if (password.length > 1024) {
    await finalizeAdminApprovalAttempt(attempt.id, actor.id, false);
    return null;
  }

  try {
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
        await finalizeAdminApprovalAttempt(attempt.id, actor.id, true);
        return {
          actorId: actor.id,
          approvedById: admin.id,
        };
      }
    }
  } catch {
    await finalizeAdminApprovalAttempt(attempt.id, actor.id, false).catch(() => undefined);
    return null;
  }

  await finalizeAdminApprovalAttempt(attempt.id, actor.id, false);

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
  } catch {
    console.error("Customer deletion failed.");

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
  const contactValidation = validateCustomerContact({
    nic: typeof input.nic === "string" ? input.nic : "",
    mobile: typeof input.mobile === "string" ? input.mobile : "",
    additionalMobile:
      typeof input.additionalMobile === "string" ? input.additionalMobile : "",
  });
  const { nic, mobile, additionalMobile } = contactValidation.normalized;
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
    Boolean(contactValidation.nicError) ||
    Boolean(contactValidation.mobileError) ||
    Boolean(contactValidation.additionalMobileError) ||
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
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await prisma.$transaction(async (tx) => {
      const existing = await tx.customer.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new Error("CUSTOMER_NOT_FOUND");
      }

      const [nicOwner, phoneOwner] = await Promise.all([
        tx.customer.findFirst({
          where: { id: { not: id }, nic },
          select: { id: true },
        }),
        tx.customerPhone.findFirst({
          where: customerPhoneOwnershipWhere([mobile, additionalMobile], id),
          select: { id: true },
        }),
      ]);

      if (nicOwner || phoneOwner) {
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
        }, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5000,
          timeout: 15000,
        });
        break;
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "P2034" &&
          attempt < 2
        ) {
          continue;
        }
        throw error;
      }
    }

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
