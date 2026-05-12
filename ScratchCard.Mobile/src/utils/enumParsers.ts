import { EntryMethod, PackStatus, SellingOrder } from "../types/enums";

export function parsePackStatus(value: unknown): PackStatus {
  if (typeof value === "string") {
    if (value === PackStatus.InStock || value === "1") return PackStatus.InStock;
    if (value === PackStatus.Active || value === "2") return PackStatus.Active;
    if (value === PackStatus.Paused || value === "3") return PackStatus.Paused;
    if (value === PackStatus.Completed || value === "4") return PackStatus.Completed;
    if (value === PackStatus.Returned || value === "5") return PackStatus.Returned;
    if (value === PackStatus.Issue || value === "6") return PackStatus.Issue;
  }

  if (typeof value === "number") {
    if (value === 1) return PackStatus.InStock;
    if (value === 2) return PackStatus.Active;
    if (value === 3) return PackStatus.Paused;
    if (value === 4) return PackStatus.Completed;
    if (value === 5) return PackStatus.Returned;
    if (value === 6) return PackStatus.Issue;
  }

  return PackStatus.InStock;
}

export function parseSellingOrder(value: unknown): SellingOrder {
  if (typeof value === "string") {
    if (value === SellingOrder.Ascending || value === "1") return SellingOrder.Ascending;
    if (value === SellingOrder.Descending || value === "2") return SellingOrder.Descending;
  }

  if (typeof value === "number") {
    if (value === 1) return SellingOrder.Ascending;
    if (value === 2) return SellingOrder.Descending;
  }

  return SellingOrder.Ascending;
}

export function toApiSellingOrder(value: SellingOrder): number {
  return value === SellingOrder.Descending ? 2 : 1;
}

export function toApiEntryMethod(value: EntryMethod): number {
  if (value === EntryMethod.Manual) return 2;
  if (value === EntryMethod.ScannedEdited) return 3;
  return 1;
}
