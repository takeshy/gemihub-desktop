const passwords = new Map<string, string>();

export function getSecretManagerSessionPassword(managerId: string): string {
  return passwords.get(managerId) || "";
}

export function setSecretManagerSessionPassword(
  managerId: string,
  password: string,
): void {
  if (password) passwords.set(managerId, password);
  else passwords.delete(managerId);
}

