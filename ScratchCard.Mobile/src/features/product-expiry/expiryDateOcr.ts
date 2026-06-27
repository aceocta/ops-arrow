// Best-effort extraction of a printed expiry / best-before date from OCR'd label text. Handles the
// common UK pack formats (ISO yyyy-MM-dd, DD/MM/YYYY, DD MON YY, MON YYYY, MM/YYYY) and prefers a
// date that follows a "use by" / "best before" keyword. Returns an ISO yyyy-MM-dd string, or
// undefined if none found.
//
// When NO expiry keyword is present we fall back to scanning the whole label, but conservatively:
// only full, unambiguous dates (a day AND a 4-digit year) are accepted, because a label is full of
// stray slash/number/word tokens (weights, prices, lot codes, product names) and a confidently
// wrong auto-filled date is worse than none.

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

// Fixed-token month alternation. Used with a trailing `(?![A-Z])` so a 3-letter month embedded in a
// longer word (DECAF, MAYONNAISE, MARKET, OCTOPUS …) is NOT mistaken for a month, and so the pattern
// stays linear (no `[A-Z]{3}[A-Z]*` overlap → no quadratic backtracking on long all-letter input).
const MON = "JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC";

// Cap the text we scan so a huge OCR block can never pin the JS thread, regardless of pattern.
const MAX_SCAN = 4000;

const pad = (n: number) => String(n).padStart(2, "0");

function isoDate(y: number, m: number, d: number): string | undefined {
  if (m < 1 || m > 12) return undefined;
  const last = new Date(y, m, 0).getDate();
  if (d < 1 || d > last) return undefined;
  return `${y}-${pad(m)}-${pad(d)}`;
}

function endOfMonth(y: number, m: number): string | undefined {
  if (m < 1 || m > 12) return undefined;
  return isoDate(y, m, new Date(y, m, 0).getDate());
}

function year4(s: string): number {
  return s.length <= 2 ? 2000 + Number(s) : Number(s);
}

// Reject dates outside a sane perishable-goods window — guards against a 2-digit/OCR misread
// producing a plausible-looking far-future expiry (e.g. "12/2099").
function inExpiryWindow(iso: string): boolean {
  const y = Number(iso.slice(0, 4));
  const nowY = new Date().getFullYear();
  return y >= nowY - 1 && y <= nowY + 6;
}

// strict = no expiry keyword was present, so only accept a full date (day + 4-digit year); the
// no-day (MON YYYY / MM/YYYY) and 2-digit-year shapes are skipped to avoid false positives.
function tryParseSegment(seg: string, strict: boolean): string | undefined {
  const yr = strict ? "(\\d{4})" : "(\\d{4}|\\d{2})";

  // 0) ISO yyyy-MM-dd (also yyyy/MM/dd, yyyy.MM.dd) — the year leads and is unambiguously 4 digits,
  // so this is safe even in strict mode and must be tried BEFORE the day-first shapes (which can't
  // anchor a leading 4-digit year and would otherwise drop the read).
  let m = seg.match(/(\d{4})[.\/\-](\d{1,2})[.\/\-](\d{1,2})/);
  if (m) {
    const r = isoDate(Number(m[1]), Number(m[2]), Number(m[3]));
    if (r) return r;
  }

  // 1) DD/MM/YYYY (or /YY when a keyword anchored us) — separators . / -
  m = seg.match(new RegExp(`(\\d{1,2})[.\\/\\-](\\d{1,2})[.\\/\\-]${yr}`));
  if (m) {
    const r = isoDate(year4(m[3]), Number(m[2]), Number(m[1]));
    if (r) return r;
  }
  // 2) DD MON YYYY / DDMONYY — e.g. "30 JUN 2025", "30JUN25"
  m = seg.match(new RegExp(`(\\d{1,2})\\s*-?\\s*(${MON})(?![A-Z])\\.?\\s*-?\\s*${yr}`));
  if (m && MONTHS[m[2]]) {
    const r = isoDate(year4(m[3]), MONTHS[m[2]], Number(m[1]));
    if (r) return r;
  }

  if (strict) return undefined; // no-day shapes are too ambiguous without an expiry keyword

  // 3) MON YYYY / MON YY (no day → end of month) — e.g. "JUN 2025"
  m = seg.match(new RegExp(`\\b(${MON})(?![A-Z])\\.?\\s*-?\\s*(\\d{4}|\\d{2})`));
  if (m && MONTHS[m[1]]) {
    const r = endOfMonth(year4(m[2]), MONTHS[m[1]]);
    if (r) return r;
  }
  // 4) MM/YYYY (no day → end of month) — e.g. "06/2025"
  m = seg.match(/(\d{1,2})[.\/\-](\d{4})/);
  if (m) {
    const r = endOfMonth(Number(m[2]), Number(m[1]));
    if (r) return r;
  }
  return undefined;
}

export function parseExpiryDate(text: string): string | undefined {
  if (!text) return undefined;
  const up = text.toUpperCase().replace(/ /g, " ").slice(0, MAX_SCAN);
  const kw = up.match(/(?:USE\s*BY|BEST\s*BEFORE(?:\s*END)?|BBE|EXP(?:IRY|IRES)?|SELL\s*BY)[:\s]*([\s\S]{0,28})/);
  let r: string | undefined;
  if (kw) r = tryParseSegment(kw[1], false);
  if (!r) r = tryParseSegment(up, true); // no keyword → require a full, unambiguous date
  return r && inExpiryWindow(r) ? r : undefined;
}
