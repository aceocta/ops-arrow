import { Download } from "lucide-react";

export default function ExportButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button className="btn-ghost" onClick={onClick} disabled={disabled}>
      <Download className="h-4 w-4" /> Export CSV
    </button>
  );
}
