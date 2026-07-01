import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getConfigurations, updateConfigurations, type ConfigurationUpdateItem } from "../api/configurations";
import { getCustomer } from "../api/customers";
import { getApiErrorMessage } from "../api/client";

// One editable shift template row. `id` is the stable template key (kept when it already exists so
// downstream references survive); `key` is a local-only React key.
type Row = { key: string; id: string; name: string; start: string; end: string; active: boolean };

function shortTime(value: unknown): string {
  const s = String(value ?? "");
  return s.length >= 5 ? s.slice(0, 5) : s;
}

// End earlier than start = the shift runs past midnight into the next day.
function isOvernight(start: string, end: string): boolean {
  return Boolean(start && end && end < start);
}

function parseTemplates(json: string | undefined): Row[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr.map((t: any) => ({
      key: crypto.randomUUID(),
      id: String(t.id ?? t.templateId ?? ""),
      name: String(t.name ?? t.shiftName ?? ""),
      start: shortTime(t.startTime ?? t.start ?? "09:00"),
      end: shortTime(t.endTime ?? t.end ?? "17:00"),
      active: t.isActive !== false,
    }));
  } catch {
    return [];
  }
}

export function ShopShiftConfigPage() {
  const { shopId = "" } = useParams();
  const location = useLocation();
  const navState = (location.state as { shopName?: string; companyId?: string; companyName?: string } | null) ?? null;
  const shopName = navState?.shopName;
  const companyId = navState?.companyId;
  const companyName = navState?.companyName;
  const qc = useQueryClient();

  const [rows, setRows] = useState<Row[]>([]);
  const [enforce, setEnforce] = useState(false);
  const [allowCustom, setAllowCustom] = useState(true);
  const [defaultName, setDefaultName] = useState("Main Shift");
  const [businessStart, setBusinessStart] = useState("06:00");
  const [businessEnd, setBusinessEnd] = useState("22:00");
  const [cutoff, setCutoff] = useState("23:59");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasInit = useRef(false);

  const query = useQuery({
    queryKey: ["configurations", shopId],
    queryFn: () => getConfigurations(shopId),
    enabled: Boolean(shopId),
  });

  // Seed the form from the loaded config once; never clobber an in-progress edit on refetch.
  useEffect(() => {
    if (!query.data || hasInit.current) return;
    const byKey = (k: string) => query.data!.find((i) => i.configKey === k)?.configValue;
    setRows(parseTemplates(byKey("ShiftTemplates")));
    setEnforce(byKey("EnforceShiftTimeWindow") === "true");
    const allow = byKey("AllowCustomShiftName");
    setAllowCustom(allow == null ? true : allow === "true");
    setDefaultName(byKey("ShiftDefaultName") || "Main Shift");
    setBusinessStart(shortTime(byKey("BusinessStartTime") || "06:00"));
    setBusinessEnd(shortTime(byKey("BusinessEndTime") || "22:00"));
    setCutoff(shortTime(byKey("BusinessDateCutOffTime") || "23:59"));
    hasInit.current = true;
  }, [query.data]);

  const update = (key: string, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setNotice(null);
  };
  const addRow = () => {
    setRows((rs) => [...rs, { key: crypto.randomUUID(), id: "", name: "", start: "09:00", end: "17:00", active: true }]);
    setNotice(null);
  };
  const removeRow = (key: string) => {
    setRows((rs) => rs.filter((r) => r.key !== key));
    setNotice(null);
  };

  const valid = rows.every((r) => r.name.trim() && r.start && r.end);

  // The full set of config items the editor manages — shared by Save and Copy-to-shops.
  const buildConfigItems = (): ConfigurationUpdateItem[] => {
    const templates = rows
      .filter((r) => r.name.trim() && r.start && r.end)
      .map((r) => ({ id: r.id || undefined, name: r.name.trim(), startTime: r.start, endTime: r.end, isActive: r.active }));
    return [
      { groupName: "Shift Settings", configKey: "ShiftTemplates", configValue: JSON.stringify(templates) },
      { groupName: "Shift Settings", configKey: "EnforceShiftTimeWindow", configValue: String(enforce) },
      { groupName: "Shift Settings", configKey: "AllowCustomShiftName", configValue: String(allowCustom) },
      { groupName: "Shift Settings", configKey: "ShiftDefaultName", configValue: defaultName.trim() || "Main Shift" },
      { groupName: "General Settings", configKey: "BusinessStartTime", configValue: businessStart },
      { groupName: "General Settings", configKey: "BusinessEndTime", configValue: businessEnd },
      { groupName: "General Settings", configKey: "BusinessDateCutOffTime", configValue: cutoff },
    ];
  };

  const saveM = useMutation({
    mutationFn: () => updateConfigurations(shopId, buildConfigItems()),
    onSuccess: () => {
      setError(null);
      setNotice("Shift configuration saved.");
      void qc.invalidateQueries({ queryKey: ["configurations", shopId] });
    },
    onError: (e) => { setNotice(null); setError(getApiErrorMessage(e, "Failed to save shift configuration.")); },
  });

  // --- Copy this configuration to other shops in the same company ---
  const [copyOpen, setCopyOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const companyQuery = useQuery({
    queryKey: ["customer", companyId],
    queryFn: () => getCustomer(companyId!),
    enabled: copyOpen && Boolean(companyId),
  });
  const otherShops = (companyQuery.data?.shops ?? []).filter((s) => s.id !== shopId);

  const copyM = useMutation({
    mutationFn: async () => {
      const items = buildConfigItems();
      const targets = Array.from(selected);
      const results = await Promise.allSettled(targets.map((id) => updateConfigurations(id, items)));
      const ok = results.filter((r) => r.status === "fulfilled").length;
      return { ok, failed: results.length - ok };
    },
    onSuccess: ({ ok, failed }) => {
      if (failed > 0) { setNotice(null); setError(`Copied to ${ok} shop(s); ${failed} failed.`); }
      else { setError(null); setNotice(`Configuration copied to ${ok} shop${ok === 1 ? "" : "s"}.`); }
      setCopyOpen(false);
      setSelected(new Set());
    },
    onError: (e) => { setNotice(null); setError(getApiErrorMessage(e, "Failed to copy configuration.")); },
  });

  return (
    <div className="page">
      <Link to="/shops" className="back-link">← Shops</Link>
      <div className="page-head">
        <h1>Shift configuration{shopName ? ` · ${shopName}` : ""}</h1>
        <div className="actions">
          {companyId ? (
            <button className="btn" disabled={query.isLoading || saveM.isPending} onClick={() => setCopyOpen((o) => !o)}>
              Copy to shops…
            </button>
          ) : null}
          <button className="btn btn-primary" disabled={!valid || saveM.isPending} onClick={() => saveM.mutate()}>
            {saveM.isPending ? "Saving…" : "Save configuration"}
          </button>
        </div>
      </div>

      {notice ? <div className="info-banner">{notice}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}
      {query.isError ? <div className="error-banner">{getApiErrorMessage(query.error, "Failed to load configuration.")}</div> : null}

      {copyOpen && companyId ? (
        <div className="card form-grid">
          <div className="span-2">
            <strong>Copy this configuration to other shops{companyName ? ` in ${companyName}` : ""}</strong>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              Applies the shift templates, settings and business-day times currently shown on this page.
            </p>
          </div>
          {companyQuery.isLoading ? (
            <p className="muted span-2">Loading shops…</p>
          ) : companyQuery.isError ? (
            <div className="error-banner span-2">{getApiErrorMessage(companyQuery.error, "Failed to load company shops.")}</div>
          ) : otherShops.length === 0 ? (
            <p className="muted span-2">No other shops in this company.</p>
          ) : (
            <div className="span-2">
              <label className="copy-shop-row" style={{ marginBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={selected.size === otherShops.length}
                  onChange={(e) => setSelected(e.target.checked ? new Set(otherShops.map((s) => s.id)) : new Set())}
                />
                <span><strong>Select all ({otherShops.length})</strong></span>
              </label>
              <div className="copy-shop-list">
                {otherShops.map((s) => (
                  <label key={s.id} className="copy-shop-row">
                    <input
                      type="checkbox"
                      checked={selected.has(s.id)}
                      onChange={(e) => setSelected((prev) => {
                        const n = new Set(prev);
                        if (e.target.checked) n.add(s.id); else n.delete(s.id);
                        return n;
                      })}
                    />
                    <span>{s.shopName}{s.city ? ` · ${s.city}` : ""}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="actions span-2">
            <button className="btn btn-primary" disabled={selected.size === 0 || copyM.isPending} onClick={() => copyM.mutate()}>
              {copyM.isPending ? "Copying…" : `Copy to ${selected.size} shop${selected.size === 1 ? "" : "s"}`}
            </button>
            <button className="btn" disabled={copyM.isPending} onClick={() => { setCopyOpen(false); setSelected(new Set()); }}>Cancel</button>
          </div>
        </div>
      ) : null}

      {query.isLoading ? (
        <div className="card"><p className="muted" style={{ padding: 18 }}>Loading…</p></div>
      ) : (
        <>
          <div className="card form-grid">
            <label className="field">
              <span>Default shift name</span>
              <input value={defaultName} onChange={(e) => { setDefaultName(e.target.value); setNotice(null); }} placeholder="Main Shift" />
            </label>
            <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <input type="checkbox" checked={enforce} onChange={(e) => { setEnforce(e.target.checked); setNotice(null); }} />
              <span>Restrict shift opening to the configured time windows</span>
            </label>
            <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <input type="checkbox" checked={allowCustom} onChange={(e) => { setAllowCustom(e.target.checked); setNotice(null); }} />
              <span>Allow staff to enter a custom shift name</span>
            </label>
          </div>

          <div className="card form-grid">
            <label className="field">
              <span>Business day start</span>
              <input type="time" value={businessStart} onChange={(e) => { setBusinessStart(e.target.value); setNotice(null); }} />
            </label>
            <label className="field">
              <span>Business day end</span>
              <input type="time" value={businessEnd} onChange={(e) => { setBusinessEnd(e.target.value); setNotice(null); }} />
            </label>
            <label className="field">
              <span>Business date cutoff</span>
              <input type="time" value={cutoff} onChange={(e) => { setCutoff(e.target.value); setNotice(null); }} />
            </label>
            <p className="muted span-2" style={{ margin: 0 }}>
              The business day window (start/end support overnight); the cutoff time is when sales roll over to the next business date.
            </p>
          </div>

          <div className="card table-wrap">
            <div className="tpl-head">
              <span className="tpl-title">Shift templates</span>
              <button className="btn btn-sm btn-primary" onClick={addRow}>+ Add shift template</button>
            </div>
            <table className="table shift-table">
              <thead>
                <tr><th>Shift name</th><th>Start</th><th>End</th><th>Overnight</th><th>Active</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={6} className="empty-cell">No shift templates yet — add one above.</td></tr>
                ) : rows.map((r) => (
                  <tr key={r.key}>
                    <td data-label="Shift name">
                      <input type="text" value={r.name} placeholder="e.g. Morning Shift" onChange={(e) => update(r.key, { name: e.target.value })} />
                    </td>
                    <td data-label="Start"><input type="time" value={r.start} onChange={(e) => update(r.key, { start: e.target.value })} /></td>
                    <td data-label="End"><input type="time" value={r.end} onChange={(e) => update(r.key, { end: e.target.value })} /></td>
                    <td data-label="Overnight" className={isOvernight(r.start, r.end) ? "" : "muted"}>{isOvernight(r.start, r.end) ? "+1 day" : "—"}</td>
                    <td data-label="Active" className="active-cell">
                      <input type="checkbox" checked={r.active} onChange={(e) => update(r.key, { active: e.target.checked })} />
                    </td>
                    <td data-label="Actions">
                      <button className="btn btn-sm btn-danger" onClick={() => removeRow(r.key)}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="tpl-foot muted">An end time earlier than the start means the shift ends the next day.</div>
          </div>
        </>
      )}
    </div>
  );
}
