// Best-effort extraction of candidate PRODUCT NAME lines from OCR'd packaging text. Used when a
// barcode lookup misses (product not in our catalogue or the online database) and the user reads
// the name straight off the label. A product label is noisy — weights, prices, barcodes, nutrition
// panels, "USE BY" dates — so rather than auto-pick one (a wrong name is worse than none) we return
// a short, ranked list of plausible name lines and let the user tap the right one.

// Lines that are almost never the product name.
const NOISE = /^(use\s*by|best\s*before|bb?e\b|exp(?:iry|ires)?\b|sell\s*by|display\s*until|nutrition|ingredients?|allerg|storage|keep\s*(?:refrigerated|frozen|cool)|once\s*opened|produce\s*of|product\s*of|made\s*in|packed|net\s*weight|contains|suitable\s*for|www\.|https?:|tel\b|lot\b|batch\b|reduced\b|multipack\b|guideline\s*daily|per\s*100|special\s*offer)/i;
// Weight / volume / count lines (e.g. "500g", "1.5 L", "6 x 330ml", "4 PACK").
const UNIT_ONLY = /^\s*\d+(\.\d+)?\s*(g|kg|ml|l|cl|oz|lb|kcal|kj|%|x|pk|pack|ct|pcs?)\b/i;
// Price tokens (£1.99, 99p, 2 for £3).
const MONEY = /[£$€]\s?\d|\b\d{1,3}\s?p\b|\bfor\s+[£$€]?\d/i;

/**
 * Returns up to `max` candidate product-name lines, best first. Empty if nothing plausible was read.
 */
export function extractNameCandidates(text: string, max = 8): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  const scored: { line: string; score: number }[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim());

  lines.forEach((rawLine, idx) => {
    // Strip a trailing standalone weight/volume/count token so "CHEDDAR 500G" -> "CHEDDAR"; this keeps
    // both halves of a wrapped name eligible to combine in the picker instead of carrying "500G".
    const line = rawLine.replace(/\s+\d+(?:\.\d+)?\s*(?:g|kg|ml|l|cl|oz|x\s?\d+|pack|pk|ct|pcs?)\b\.?$/i, "").trim();
    if (line.length < 3 || line.length > 50) return;
    const letters = (line.match(/[A-Za-z]/g) || []).length;
    const digits = (line.match(/\d/g) || []).length;
    if (letters < 3) return; // need real words
    if (letters / line.length < 0.5) return; // mostly symbols/numbers
    if (digits >= letters && letters < 4) return; // codes / measurements, but keep "7UP"/"100% Beef"
    if (NOISE.test(line)) return;
    if (MONEY.test(line)) return;
    if (UNIT_ONLY.test(line)) return;
    const words = line.split(" ").filter(Boolean).length;
    if (words > 8) return; // a sentence (ingredients, marketing copy) is not a name

    const key = line.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);

    // Score: prefer lines near the top, with more letters, fewer digits, and a short word count.
    let score = 0;
    score += Math.max(0, 8 - idx); // top lines first
    score += Math.min(letters, 20) / 4; // longer (real) names
    score -= digits; // penalise stray digits
    if (words >= 1 && words <= 4) score += 3; // typical name shape
    if (letters >= 4 && /^[A-Z0-9 '&.\-]+$/.test(line)) score += 2; // ALL-CAPS brand/name lines

    scored.push({ line, score });
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((s) => s.line);
}
