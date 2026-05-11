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
  if (closing < min || closing > max || opening < min || opening > max) {
    throw new Error("Closing serial is out of range.");
  }

  const soldQuantity =
    sellingOrder === SellingOrder.Ascending ? closing - opening : opening - closing;

  if (soldQuantity < 0 || soldQuantity > totalTickets) {
    throw new Error("Invalid selling order sequence.");
  }

  const remainingTickets =
    sellingOrder === SellingOrder.Ascending
      ? Math.max(0, max - closing)
      : Math.max(0, closing - min);

  return {
    soldQuantity,
    salesAmount: soldQuantity * ticketPrice,
    remainingTickets
  };
}
