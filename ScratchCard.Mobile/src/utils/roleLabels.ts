const roleLabelOverrides: Record<string, string> = {
  companyowner: "Company Owner",
  platformadmin: "Platform Admin",
  salesassistant: "Sales Assistant",
};

function normalizeRoleKey(role: string) {
  return role.replace(/[\s_-]+/g, "").toLowerCase();
}

export function getRoleDisplayName(role: string | null | undefined) {
  if (!role) {
    return "-";
  }

  const trimmed = role.trim();
  if (!trimmed) {
    return "-";
  }

  const mapped = roleLabelOverrides[normalizeRoleKey(trimmed)];
  if (mapped) {
    return mapped;
  }

  if (trimmed.includes(" ")) {
    return trimmed;
  }

  return trimmed.replace(/([a-z])([A-Z])/g, "$1 $2");
}
