export function isAccountActive(account: {
  isActive: boolean;
  employee: { isActive: boolean } | null;
}) {
  return account.isActive && (!account.employee || account.employee.isActive);
}
