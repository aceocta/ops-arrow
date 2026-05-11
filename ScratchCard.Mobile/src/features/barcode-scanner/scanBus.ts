type ScanPayload = {
  packId?: string;
  parsedPackNumber?: string;
  rawBarcode: string;
  parsedSerial: string;
  barcodeType?: string;
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
