type StaffLike = {
  staffMemberInitials: string;
  recordedByName?: string;
};

function cleanToken(value: string) {
  const alphanumeric = value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return alphanumeric.slice(0, 20);
}

export function buildDefaultStaffDisplayName(firstName?: string, lastName?: string, email?: string, displayName?: string) {
  const name = (displayName ?? `${firstName ?? ""} ${lastName ?? ""}`).trim();
  if (name.length > 0) {
    return name;
  }

  const emailValue = (email ?? "").trim();
  if (!emailValue) {
    return "";
  }

  const emailPrefix = emailValue.split("@")[0] ?? "";
  return emailPrefix || emailValue;
}

export function buildStaffInitialsForPayload(displayName?: string, email?: string) {
  const normalizedName = (displayName ?? "").trim();
  if (normalizedName.length > 0) {
    const parts = normalizedName
      .split(" ")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    if (parts.length > 1) {
      const initials = cleanToken(parts.map((part) => part[0]).join(""));
      if (initials.length > 0) {
        return initials;
      }
    }

    const compact = cleanToken(normalizedName);
    if (compact.length > 0) {
      return compact;
    }
  }

  const fallback = cleanToken((email ?? "").trim().slice(0, 1));
  return fallback || "NA";
}

export function getStaffDisplayName(entry: StaffLike) {
  const recordedByName = (entry.recordedByName ?? "").trim();
  if (recordedByName.length > 0) {
    return recordedByName;
  }

  return entry.staffMemberInitials;
}
