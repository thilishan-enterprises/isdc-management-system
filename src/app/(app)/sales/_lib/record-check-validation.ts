import { validateCustomerContact } from "@/lib/customer-contact";

export const SALE_BILL_NUMBER_PATTERN = /^\d{4}$/;
export const SALE_BILL_NUMBER_ERROR = "Enter exactly four digits.";

export type SaleRecordCheckField =
  | "billNumber"
  | "fullName"
  | "address"
  | "nic"
  | "mobile"
  | "additionalMobile";

export type SaleRecordCheckValues = Record<SaleRecordCheckField, string>;

export function isValidSaleBillNumber(value: string) {
  return SALE_BILL_NUMBER_PATTERN.test(value.trim());
}

export function sanitizeSaleBillNumberInput(value: string) {
  return value.replace(/[^0-9]/g, "").slice(0, 4);
}

export function validateSaleRecordCheck(values: SaleRecordCheckValues) {
  const errors: Partial<Record<SaleRecordCheckField, string>> = {};
  const contact = validateCustomerContact(values);

  if (!isValidSaleBillNumber(values.billNumber)) {
    errors.billNumber = SALE_BILL_NUMBER_ERROR;
  }
  if (values.fullName.trim().length < 2) {
    errors.fullName = "Enter the customer's full name.";
  } else if (values.fullName.trim().length > 150) {
    errors.fullName = "Customer name must not exceed 150 characters.";
  }
  if (values.address.trim().length < 3) {
    errors.address = "Enter the customer's address.";
  } else if (values.address.trim().length > 500) {
    errors.address = "Address must not exceed 500 characters.";
  }
  if (contact.nicError) errors.nic = contact.nicError;
  if (contact.mobileError) errors.mobile = contact.mobileError;
  if (contact.additionalMobileError) {
    errors.additionalMobile = contact.additionalMobileError;
  }

  return errors;
}
