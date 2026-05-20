const gbpCurrencyFormatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function toFiniteNumber(value: number | null | undefined, fallback = 0) {
  if (value == null || !Number.isFinite(value)) {
    return fallback;
  }
  return Number(value);
}

export function formatGbp(value: number | null | undefined) {
  return gbpCurrencyFormatter.format(toFiniteNumber(value));
}

export function formatGbpOrDash(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return "-";
  }

  return formatGbp(value);
}

export function formatSignedGbp(value: number | null | undefined) {
  const amount = toFiniteNumber(value);
  const sign = amount < 0 ? "-" : "+";
  return `${sign}${formatGbp(Math.abs(amount))}`;
}
