import { SellingOrder } from "../types/enums";

export type SerialCalculation = {
  soldQuantity: number;
  salesAmount: number;
  remainingTickets: number;
};

export function calculateShiftSales(
  openingSerial: string,
  closingSerial: string,
  startSerial: string,
  endSerial: string,
  sellingOrder: SellingOrder,
  ticketPrice: number,
  totalTickets: number
): SerialCalculation {
  const opening = Number(openingSerial);
  const closing = Number(closingSerial);
  const start = Number(startSerial);
  const end = Number(endSerial);

  if ([opening, closing, start, end].some((x) => Number.isNaN(x))) {
    throw new Error("Serial numbers must be numeric.");
  }

  const min = Math.min(start, end);
  const max = Math.max(start, end);

  // Range check first — the closing must always sit somewhere between the pack's start and end.
  if (closing < min || closing > max) {
    throw new Error(`Closing serial must be between ${min} and ${max} for this pack.`);
  }
  if (opening < min || opening > max) {
    throw new Error(`Opening serial ${opening} is outside the pack range (${min}-${max}).`);
  }

  // Direction check — message describes the rule for the pack's specific selling order so the
  // user knows which side of opening they're allowed on, and which value to compare against.
  const isAscending = sellingOrder === SellingOrder.Ascending;
  if (isAscending && closing < opening) {
    throw new Error(`Closing serial must be the same or after opening (${opening}) for ascending packs.`);
  }
  if (!isAscending && closing > opening) {
    throw new Error(`Closing serial must be the same or before opening (${opening}) for descending packs.`);
  }

  const soldQuantity = isAscending ? closing - opening : opening - closing;

  if (soldQuantity > totalTickets) {
    throw new Error(`Sold quantity ${soldQuantity} exceeds the pack's ${totalTickets} tickets.`);
  }

  const remainingTickets = isAscending
    ? Math.max(0, max - closing)
    : Math.max(0, closing - min);

  return {
    soldQuantity,
    salesAmount: soldQuantity * ticketPrice,
    remainingTickets,
  };
}
