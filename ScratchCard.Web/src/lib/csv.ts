// Client-side CSV export — builds the file from already-loaded rows, so it adds
// zero backend load (no impact on the mobile app's query paths).
type Cell = string | number | null | undefined;

function escape(v: Cell) {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(filename: string, headers: string[], rows: Cell[][]) {
  const lines = [headers, ...rows].map((r) => r.map(escape).join(","));
  // Prepend BOM so Excel reads UTF-8 correctly.
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
