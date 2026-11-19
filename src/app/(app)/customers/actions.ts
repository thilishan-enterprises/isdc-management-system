"use server";
import { prisma } from "@/lib/prisma";
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
} from "@/lib/customer-contact";
import { customerPhoneOwnershipWhere } from "@/lib/customer-ownership";
import {
  getUniqueCustomerField,
  hasPrismaCode,
} from "@/lib/customer-prisma-errors";

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
