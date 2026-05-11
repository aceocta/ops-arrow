export type ParsedBarcodeResult = {
  rawBarcode: string;
  parsedPackNumber?: string;
  parsedSerial: string;
};

function normalizeDashes(value: string) {
  return value.replace(/[\u2010\u2011\u2012\u2013\u2014\u2212\uFE58\uFE63\uFF0D]/g, "-");
}

function extractSerial(segment: string) {
  const digits = segment.replace(/\D/g, "");
  if (!digits) {
    return segment.trim();
  }

  if (digits.length <= 3) {
    return digits;
  }

  // Prefer the right-most 3 digits for longer/noisy suffixes.
  return digits.slice(-3);
}

export function parseBarcode(rawValue: string): ParsedBarcodeResult {
  const clean = normalizeDashes(rawValue.trim());
  const compact = clean.replace(/\s+/g, "");
  const lastHyphen = compact.lastIndexOf("-");

  if (lastHyphen > 0 && lastHyphen < compact.length - 1) {
    const parsedPackNumber = compact.slice(0, lastHyphen);
    const serialPart = compact.slice(lastHyphen + 1);
    const parsedSerial = extractSerial(serialPart);
    return { rawBarcode: clean, parsedPackNumber, parsedSerial };
  }

  // Numeric-only payload fallback (common for ITF-14 style scans).
  const digitsOnly = clean.replace(/\D/g, "");
  if (digitsOnly.length > 4) {
    const parsedSerial = extractSerial(digitsOnly);
    const parsedPackNumber = digitsOnly.slice(0, Math.max(0, digitsOnly.length - parsedSerial.length));
    return { rawBarcode: clean, parsedPackNumber, parsedSerial };
  }

  const parsedSerial = extractSerial(clean);
  return { rawBarcode: clean, parsedSerial };
}
