export const NIC_ERROR =
  "Enter a valid NIC containing exactly 9 or 12 digits.";

export const PRIMARY_MOBILE_ERROR =
  "Enter a valid 10-digit mobile number starting with 070, 071, 072, 074, 075, 076, 077, or 078.";

export const ADDITIONAL_MOBILE_ERROR =
  "Enter a valid mobile number with 10 to 15 digits.";

export const NIC_PATTERN = /^(?:\d{9}|\d{12})$/;
export const PRIMARY_MOBILE_PATTERN =
  /^(?:070|071|072|074|075|076|077|078)\d{7}$/;

export function normalizeNic(value: string) {
  return value.trim();
}

export type CustomerContactValues = {
  nic: string;
  mobile: string;
  additionalMobile: string;
};

export function normalizeCustomerContact(
  values: CustomerContactValues,
): CustomerContactValues {
  return {
    nic: normalizeNic(values.nic),
    mobile: normalizePhone(values.mobile),
    additionalMobile: normalizePhone(values.additionalMobile),
  };
}

export function validateCustomerContact(values: CustomerContactValues) {
  const normalized = normalizeCustomerContact(values);

  return {
    normalized,
    nicError: isValidNic(normalized.nic) ? undefined : NIC_ERROR,
    mobileError: isValidPrimaryMobile(normalized.mobile)
      ? undefined
      : PRIMARY_MOBILE_ERROR,
    additionalMobileError: !isValidAdditionalMobile(
      normalized.additionalMobile,
    )
      ? ADDITIONAL_MOBILE_ERROR
      : normalized.additionalMobile === normalized.mobile
        ? "Primary and additional mobile numbers must be different."
        : undefined,
  };
}

export function normalizePhone(value: string) {
  return value.trim();
}

export function isValidNic(value: string) {
  return NIC_PATTERN.test(normalizeNic(value));
}

export function isValidPrimaryMobile(value: string) {
  return PRIMARY_MOBILE_PATTERN.test(normalizePhone(value));
}

export function isValidAdditionalMobile(value: string) {
  const normalized = normalizePhone(value);

  if (!normalized) return true;
  if (!/^\d{10,15}$/.test(normalized)) return false;

  return normalized.length > 10 || isValidPrimaryMobile(normalized);
}

export function toWhatsAppNumber(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";

  if (isValidPrimaryMobile(normalized)) {
    return `94${normalized.slice(1)}`;
  }

  if (/^\+[1-9]\d{7,14}$/.test(normalized)) {
    return normalized.slice(1);
  }

  return null;
}
