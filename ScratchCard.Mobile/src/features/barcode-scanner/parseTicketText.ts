function normalizeDashes(value: string) {
  return value.replace(/[\u2010\u2011\u2012\u2013\u2014\u2212\uFE58\uFE63\uFF0D]/g, "-");
}

function normalizeLikelyDigits(value: string) {
  // OCR can confuse similar glyphs in numeric tickets.
  return value
    .toUpperCase()
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/S/g, "5")
    .replace(/B/g, "8");
}

function normalizePackNumber(value: string) {
  return value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

type ParsedTicketText = {
  rawBarcode: string;
  parsedPackNumber: string;
  parsedSerial: string;
};

export function parseTicketText(rawText: string, expectedPackNumber?: string): ParsedTicketText | null {
  if (!rawText?.trim()) {
    return null;
  }

  const expectedPackNormalized = expectedPackNumber ? normalizePackNumber(expectedPackNumber) : undefined;
  const normalizedText = normalizeLikelyDigits(normalizeDashes(rawText));
  const compactText = normalizedText.replace(/\s+/g, "");

  const candidates = new Map<string, ParsedTicketText>();
  const addCandidate = (game: string, pack: string, serial: string) => {
    const parsedPackNumber = `${game}-${pack}`;
    const candidate: ParsedTicketText = {
      rawBarcode: `${game}-${pack}-${serial}`,
      parsedPackNumber,
      parsedSerial: serial,
    };
    candidates.set(`${parsedPackNumber}|${serial}`, candidate);
  };

  const hyphenPattern = /(\d{4})\s*-\s*(\d{7})\s*-\s*(\d{3})/g;
  for (const match of normalizedText.matchAll(hyphenPattern)) {
    addCandidate(match[1], match[2], match[3]);
  }

  // Fallback for OCR output that strips separators.
  const numericChunks = compactText.match(/\d{14}/g) ?? [];
  for (const chunk of numericChunks) {
    addCandidate(chunk.slice(0, 4), chunk.slice(4, 11), chunk.slice(11, 14));
  }

  if (candidates.size === 0) {
    return null;
  }

  const ordered = [...candidates.values()];
  if (!expectedPackNormalized) {
    return ordered[0];
  }

  const matched = ordered.find((candidate) => normalizePackNumber(candidate.parsedPackNumber) === expectedPackNormalized);
  return matched ?? null;
}

