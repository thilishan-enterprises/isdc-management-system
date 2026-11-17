import type { Prisma } from "@/generated/prisma/client";

export function customerPhoneOwnershipWhere(
  phoneNumbers: string[],
  excludeCustomerId?: string,
): Prisma.CustomerPhoneWhereInput {
  return {
    ...(excludeCustomerId
      ? { customerId: { not: excludeCustomerId } }
      : {}),
    normalizedPhone: { in: [...new Set(phoneNumbers.filter(Boolean))] },
  };
}

export function customerOwnershipConflicts(
  owner: {
    nic: string;
    mobile: string;
    additionalMobile: string | null;
  } | null,
  identity: { nic: string; mobile: string; additionalMobile: string },
) {
  if (!owner) return { nic: false, mobile: false, additionalMobile: false };

  const ownerPhones = new Set(
    [owner.mobile, owner.additionalMobile].filter(
      (value): value is string => Boolean(value),
    ),
  );

  return {
    nic: owner.nic === identity.nic,
    mobile: ownerPhones.has(identity.mobile),
    additionalMobile: Boolean(
      identity.additionalMobile && ownerPhones.has(identity.additionalMobile),
    ),
  };
}
