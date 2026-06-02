type ScanPayload = {
  packId?: string;
  parsedPackNumber?: string;
  rawBarcode: string;
  parsedSerial: string;
  barcodeType?: string;
  // Scanner mode that produced this scan. "auto" = the bulk "Scan Any Pack" flow, which is allowed
  // to overwrite an already-recorded pack; "single" = targeted per-pack scan.
  mode?: "single" | "auto";
};

type Listener = (payload: ScanPayload) => void;

const listeners = new Set<Listener>();

export function emitScan(payload: ScanPayload) {
  listeners.forEach((listener) => listener(payload));
}

export function subscribeScan(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
