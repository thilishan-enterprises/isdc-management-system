export function getUniqueCustomerField(
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
  ) {
    return "phone";
  }
  if (targetText.includes("mobile")) return "mobile";

  return null;
}

export function hasPrismaCode(error: unknown, code: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}
