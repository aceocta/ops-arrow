// Tiny pub/sub so the dedicated product scanner can hand a scan back to whatever screen launched it
// (React Navigation discourages passing callbacks through route params). Carries the raw decoded
// string plus the symbology type so the consumer can GS1-parse 2D codes (Data Matrix / QR).
// A barcode scan carries { raw, type }; a date-OCR scan carries { expiry: "yyyy-MM-dd" }.
export type ProductScan = { raw?: string; type?: string; expiry?: string };

type Listener = (scan: ProductScan) => void;

const listeners = new Set<Listener>();

export function emitProductScan(scan: ProductScan) {
  listeners.forEach((listener) => listener(scan));
}

export function subscribeProductScan(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
