import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCustomer, setCustomerStatus, updateCustomer } from "../api/customers";
import { cancelSubscription, listPlans, reactivateSubscription, selectPlan } from "../api/subscription";
import { getApiErrorMessage } from "../api/client";
import type { AdminUpdateCustomerRequest, CustomerDetail } from "../types";

type Tab = "overview" | "shops" | "users" | "subscription";

export function CustomerDetailPage() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");
  const [notice, setNotice] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["customer", id],
    queryFn: () => getCustomer(id),
    enabled: Boolean(id),
  });

  const customer = query.data;

  if (query.isLoading) return <div className="page"><p className="muted">Loading…</p></div>;
  if (query.isError || !customer) {
    return (
      <div className="page">
        <Link to="/customers" className="back-link">← Customers</Link>
        <div className="error-banner">{getApiErrorMessage(query.error, "Customer not found.")}</div>
      </div>
    );
  }

  return (
    <div className="page">
      <Link to="/customers" className="back-link">← Customers</Link>
      <div className="page-head">
        <h1>{customer.companyName}</h1>
        <span className={`badge ${customer.isActive ? "badge-ok" : "badge-warn"}`}>{customer.status}</span>
      </div>

      {notice ? <div className="info-banner">{notice}</div> : null}

      <div className="tabs">
        <button className={tab === "overview" ? "tab active" : "tab"} onClick={() => setTab("overview")}>Overview</button>
        <button className={tab === "shops" ? "tab active" : "tab"} onClick={() => setTab("shops")}>Shops ({customer.shops.length})</button>
        <button className={tab === "users" ? "tab active" : "tab"} onClick={() => setTab("users")}>Users ({customer.users.length})</button>
        <button className={tab === "subscription" ? "tab active" : "tab"} onClick={() => setTab("subscription")}>Subscription</button>
      </div>

      {tab === "overview" && <OverviewTab customer={customer} onNotice={setNotice} />}
      {tab === "shops" && <ShopsTab customer={customer} />}
      {tab === "users" && <UsersTab customer={customer} />}
      {tab === "subscription" && (
        <SubscriptionTab
          customer={customer}
          onNotice={(m) => {
            setNotice(m);
            void queryClient.invalidateQueries({ queryKey: ["customer", id] });
          }}
        />
      )}
    </div>
  );
}

function OverviewTab({ customer, onNotice }: { customer: CustomerDetail; onNotice: (m: string) => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AdminUpdateCustomerRequest>(toForm(customer));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setForm(toForm(customer)), [customer]);

  const saveMutation = useMutation({
    mutationFn: () => updateCustomer(customer.id, form),
    onSuccess: (updated) => {
      queryClient.setQueryData(["customer", customer.id], updated);
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      onNotice("Customer details saved.");
      setError(null);
    },
    onError: (e) => setError(getApiErrorMessage(e, "Failed to save.")),
  });

  const statusMutation = useMutation({
    mutationFn: (isActive: boolean) => setCustomerStatus(customer.id, isActive),
    onSuccess: (updated) => {
      queryClient.setQueryData(["customer", customer.id], updated);
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      onNotice(updated.isActive ? "Customer activated." : "Customer suspended.");
    },
    onError: (e) => setError(getApiErrorMessage(e, "Failed to change status.")),
  });

  const set = (k: keyof AdminUpdateCustomerRequest) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="card form-grid">
      {error ? <div className="error-banner span-2">{error}</div> : null}
      <label className="field"><span>Company name</span><input value={form.companyName} onChange={set("companyName")} /></label>
      <label className="field"><span>Email</span><input value={form.email} onChange={set("email")} /></label>
      <label className="field"><span>Registration number</span><input value={form.registrationNumber ?? ""} onChange={set("registrationNumber")} /></label>
      <label className="field"><span>Phone</span><input value={form.phoneNumber ?? ""} onChange={set("phoneNumber")} /></label>
      <label className="field"><span>Address line 1</span><input value={form.addressLine1 ?? ""} onChange={set("addressLine1")} /></label>
      <label className="field"><span>Address line 2</span><input value={form.addressLine2 ?? ""} onChange={set("addressLine2")} /></label>
      <label className="field"><span>City</span><input value={form.city ?? ""} onChange={set("city")} /></label>
      <label className="field"><span>Post code</span><input value={form.postCode ?? ""} onChange={set("postCode")} /></label>
      <label className="field"><span>Country</span><input value={form.country ?? ""} onChange={set("country")} /></label>

      <div className="actions span-2">
        <button className="btn btn-primary" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          {saveMutation.isPending ? "Saving…" : "Save changes"}
        </button>
        {customer.isActive ? (
          <button className="btn btn-danger" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate(false)}>
            Suspend customer
          </button>
        ) : (
          <button className="btn btn-success" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate(true)}>
            Activate customer
          </button>
        )}
      </div>
    </div>
  );
}

function ShopsTab({ customer }: { customer: CustomerDetail }) {
  return (
    <div className="card">
      <table className="table">
        <thead><tr><th>Shop</th><th>City</th><th>Subscription</th><th>Status</th></tr></thead>
        <tbody>
          {customer.shops.length === 0 ? (
            <tr><td colSpan={4} className="muted">No shops.</td></tr>
          ) : customer.shops.map((s) => (
            <tr key={s.id}>
              <td>{s.shopName}</td>
              <td className="muted">{s.city}</td>
              <td><span className="badge">{s.subscriptionStatus}</span></td>
              <td><span className={`badge ${s.isActive ? "badge-ok" : "badge-warn"}`}>{s.isActive ? "Active" : "Inactive"}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UsersTab({ customer }: { customer: CustomerDetail }) {
  return (
    <div className="card">
      <table className="table">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Shop</th><th>Last login</th><th>Status</th></tr></thead>
        <tbody>
          {customer.users.length === 0 ? (
            <tr><td colSpan={6} className="muted">No users.</td></tr>
          ) : customer.users.map((u, i) => (
            <tr key={`${u.userId}-${i}`}>
              <td>{u.fullName}</td>
              <td className="muted">{u.email}</td>
              <td>{u.roleName}</td>
              <td className="muted">{u.shopName}</td>
              <td className="muted">{u.lastLoginOn ? new Date(u.lastLoginOn).toLocaleString() : "—"}</td>
              <td><span className={`badge ${u.isActive ? "badge-ok" : "badge-warn"}`}>{u.isActive ? "Active" : "Inactive"}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SubscriptionTab({ customer, onNotice }: { customer: CustomerDetail; onNotice: (m: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [planId, setPlanId] = useState("");

  const plansQuery = useQuery({ queryKey: ["plans"], queryFn: listPlans });

  const selectMutation = useMutation({
    mutationFn: () => selectPlan(customer.id, planId),
    onSuccess: () => { onNotice("Plan assigned."); setError(null); },
    onError: (e) => setError(getApiErrorMessage(e, "Failed to assign plan.")),
  });
  const cancelMutation = useMutation({
    mutationFn: () => cancelSubscription(customer.id, true),
    onSuccess: () => { onNotice("Subscription cancellation scheduled."); setError(null); },
    onError: (e) => setError(getApiErrorMessage(e, "Failed to cancel.")),
  });
  const reactivateMutation = useMutation({
    mutationFn: () => reactivateSubscription(customer.id),
    onSuccess: () => { onNotice("Subscription reactivated."); setError(null); },
    onError: (e) => setError(getApiErrorMessage(e, "Failed to reactivate.")),
  });

  const sub = customer.subscription;

  return (
    <div className="card form-grid">
      {error ? <div className="error-banner span-2">{error}</div> : null}

      <div className="kv span-2">
        <div><span className="kv-label">Status</span><span className="badge">{sub.status}</span></div>
        <div><span className="kv-label">Plan</span><span>{sub.planName ?? "—"}</span></div>
        <div><span className="kv-label">Active shop subscriptions</span><span>{sub.activeShopSubscriptionCount} / {sub.totalShopSubscriptionCount}</span></div>
      </div>

      <label className="field span-2">
        <span>Assign company plan</span>
        <select value={planId} onChange={(e) => setPlanId(e.target.value)}>
          <option value="">Select a plan…</option>
          {(plansQuery.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>{p.name} · {p.billingCycle} · £{p.pricePerShop}/shop</option>
          ))}
        </select>
      </label>

      <div className="actions span-2">
        <button className="btn btn-primary" disabled={!planId || selectMutation.isPending} onClick={() => selectMutation.mutate()}>
          {selectMutation.isPending ? "Assigning…" : "Assign plan"}
        </button>
        <button className="btn btn-success" disabled={reactivateMutation.isPending} onClick={() => reactivateMutation.mutate()}>
          Reactivate
        </button>
        <button className="btn btn-danger" disabled={cancelMutation.isPending} onClick={() => cancelMutation.mutate()}>
          Cancel at period end
        </button>
      </div>
      <p className="muted span-2">
        Company-level subscription actions (PlatformAdmin tooling). The live product is billed per shop; the per-shop
        rollup is shown above and on the Shops tab.
      </p>
    </div>
  );
}

function toForm(c: CustomerDetail): AdminUpdateCustomerRequest {
  return {
    companyName: c.companyName,
    registrationNumber: c.registrationNumber ?? "",
    email: c.email,
    phoneNumber: c.phoneNumber ?? "",
    addressLine1: c.addressLine1 ?? "",
    addressLine2: c.addressLine2 ?? "",
    city: c.city ?? "",
    postCode: c.postCode ?? "",
    country: c.country ?? "",
    isActive: c.isActive,
  };
}
