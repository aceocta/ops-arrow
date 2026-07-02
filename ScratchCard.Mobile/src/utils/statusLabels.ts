// Turns the API's PascalCase enum codes (InStock, ReadyToClose, SyncFailed…) into friendly,
// sentence-case labels for display. Raw enum codes leaking into the UI is a recurring paid-product
// smell — route status strings shown to users through here.

// Overrides for cases the generic splitter wouldn't get quite right.
const STATUS_OVERRIDES: Record<string, string> = {
  ScannedEdited: "Scanned (edited)",
  ReadyToClose: "Ready to close",
  PastDue: "Past due",
};

export function humanizeStatus(status?: string | null): string {
  if (!status) return "—";
  const trimmed = String(status).trim();
  if (!trimmed) return "—";
  if (STATUS_OVERRIDES[trimmed]) return STATUS_OVERRIDES[trimmed];

  // Split PascalCase / camelCase boundaries ("ReadyToClose" -> "Ready To Close"), then sentence-case.
  const spaced = trimmed.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}
