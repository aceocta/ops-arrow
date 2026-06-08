import { Construction } from "lucide-react";

export default function Placeholder({ title }: { title: string }) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
      <div className="card flex flex-col items-center justify-center gap-3 p-12 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
          <Construction className="h-6 w-6" />
        </span>
        <div className="text-sm font-medium text-slate-700">{title} is coming next</div>
        <p className="max-w-sm text-sm text-slate-400">
          This is the web portal foundation. This section will use the same API as the mobile app, with
          web-optimised tables, filters and exports.
        </p>
      </div>
    </div>
  );
}
