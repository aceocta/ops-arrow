// Minimal GS1 element-string parser for 2D barcodes (GS1 Data Matrix / QR) on retail packs. Pulls
// the fields we need: GTIN (AI 01), expiry (AI 17), best-before (AI 15), batch/lot (AI 10),
// serial (AI 21). Only 2-digit AIs are handled — the load-bearing ones for product packs; 3-4 digit
// AIs (e.g. 3xxx weights) are read as variable-length and ignored, which is safe for our fields.
const GS = ""; // FNC1 / Group Separator that terminates variable-length fields

// AI → fixed value length (digits AFTER the 2-digit AI).
const FIXED_LEN: Record<string, number> = {
  "00": 18, "01": 14, "02": 14,
  "11": 6, "12": 6, "13": 6, "15": 6, "16": 6, "17": 6,
  "20": 2,
};

export type Gs1Parsed = {
  gtin?: string;
  expiry?: string; // yyyy-MM-dd (AI 17)
  bestBefore?: string; // yyyy-MM-dd (AI 15)
  batch?: string; // AI 10
  serial?: string; // AI 21
};

function gs1DateToIso(yymmdd: string): string | undefined {
  if (!/^\d{6}$/.test(yymmdd)) return undefined;
  const yy = Number(yymmdd.slice(0, 2));
  const mm = Number(yymmdd.slice(2, 4));
  let dd = Number(yymmdd.slice(4, 6));
  if (mm < 1 || mm > 12) return undefined;
  const year = 2000 + yy; // date codes are always near-future; 20YY is correct through 2099
  if (dd === 0) dd = new Date(year, mm, 0).getDate(); // GS1 "00" day = end of month
  // Month-aware upper bound: reject impossible days (e.g. 0631 / 0230) — `new Date()` would silently
  // roll them into the next month and quietly extend the expiry.
  const last = new Date(year, mm, 0).getDate();
  if (dd < 1 || dd > last) return undefined;
  return `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/** Pad a numeric 1D code (EAN-13 / UPC) up to a GTIN-14 so 1D and 2D scans of the same product
 *  resolve to the same barcode key. Non-numeric codes (e.g. code128) are returned unchanged. */
export function normalizeGtin(code: string): string {
  return /^\d{12,14}$/.test(code) ? code.padStart(14, "0") : code;
}

/** True when position `j` begins a fixed-length AI we extract, with a plausible value. Used to recover
 *  the end of a variable-length field when its trailing FNC1/GS separator was dropped (mis-encoded
 *  label / scanner stripped the GS). Restricted to AI 01 (GTIN-14) and the date AIs 17/15, and the
 *  date value must be a valid GS1 date, so an all-numeric batch value isn't split on a coincidental
 *  "17"/"15"/"01" substring. */
function isFixedAiBoundary(s: string, j: number): boolean {
  const ai = s.slice(j, j + 2);
  if (ai === "01") {
    const v = s.slice(j + 2, j + 2 + 14);
    return v.length === 14 && /^\d+$/.test(v);
  }
  if (ai === "17" || ai === "15") {
    return gs1DateToIso(s.slice(j + 2, j + 2 + 6)) !== undefined;
  }
  return false;
}

export function parseGs1(raw: string): Gs1Parsed {
  let s = raw;
  if (/^\][A-Za-z]\d/.test(s)) s = s.slice(3); // strip AIM symbology id (]d2, ]Q3, …) — exactly ] + letter + digit
  if (s.startsWith(GS)) s = s.slice(1); // leading FNC1

  const out: Gs1Parsed = {};
  let i = 0;
  while (i < s.length) {
    if (s[i] === GS) {
      i += 1;
      continue;
    }
    const ai = s.slice(i, i + 2);
    if (ai.length < 2) break;

    let value: string;
    if (ai in FIXED_LEN) {
      const len = FIXED_LEN[ai];
      value = s.slice(i + 2, i + 2 + len);
      i += 2 + len;
    } else {
      // Variable-length: run to the next GS, or — if the GS is missing — to the start of a
      // recognizable fixed AI, so a trailing AI-17 expiry isn't swallowed into the batch value.
      let j = i + 2;
      while (j < s.length && s[j] !== GS && !isFixedAiBoundary(s, j)) j += 1;
      value = s.slice(i + 2, j);
      i = j;
    }

    if (ai === "01") out.gtin = value;
    else if (ai === "17") out.expiry = gs1DateToIso(value);
    else if (ai === "15") out.bestBefore = gs1DateToIso(value);
    else if (ai === "10") out.batch = value;
    else if (ai === "21") out.serial = value;
  }
  return out;
}

/** Heuristic GS1 detection beyond symbology type: a GS1 AIM id, an embedded GS, or a leading
 *  fixed-length AI 01/00 (GTIN). Restricted to 01/00 (14/18 digit values) so a plain numeric 1D
 *  EAN/UPC — which can begin with any digits, e.g. "17…" — isn't mis-read as a GS1 element string. */
function looksLikeGs1(raw: string): boolean {
  if (/^\][A-Za-z]\d/.test(raw)) return true;
  if (raw.includes(GS)) return true;
  for (const ai of ["01", "00"] as const) {
    if (raw.startsWith(ai)) {
      const len = FIXED_LEN[ai];
      const v = raw.slice(2, 2 + len);
      if (v.length === len && /^\d+$/.test(v)) return true;
    }
  }
  return false;
}

/** Parse only when the scan is a GS1 2D element string (vs a plain 1D EAN/UPC). Returns null when it
 *  isn't GS1 or no recognized field was found, so the caller falls back to treating it as a raw barcode. */
export function parseGs1IfApplicable(raw: string, type?: string): Gs1Parsed | null {
  const is2d = type === "datamatrix" || type === "qr";
  if (!is2d && !looksLikeGs1(raw)) return null;
  const parsed = parseGs1(raw);
  return parsed.gtin || parsed.expiry || parsed.bestBefore || parsed.batch ? parsed : null;
}
