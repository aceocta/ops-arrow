import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  assignCustomerUserRole,
  cancelShopSubscription,
  getCustomer,
  reactivateShopSubscription,
  selectShopPlan,
  setCustomerStatus,
  setCustomerUserActive,
  updateCustomer,
} from "../api/customers";
import { listPlans } from "../api/subscription";
import { listRoles } from "../api/lookups";
import { getApiErrorMessage } from "../api/client";
import type { AdminUpdateCustomerRequest, CustomerDetail, CustomerUser, ShopSummary } from "../types";

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
        <span className={`status ${customer.isActive ? "status--ok" : "status--warn"}`}>
          <span className="dot" />{customer.status}
        </span>
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
      {tab === "users" && (
        <UsersTab
          customer={customer}
          onResult={(updated, message) => {
            queryClient.setQueryData(["customer", id], updated);
            void queryClient.invalidateQueries({ queryKey: ["customers"] });
            setNotice(message);
          }}
        />
      )}
      {tab === "subscription" && (
        <SubscriptionTab
          customer={customer}
          onResult={(updated, message) => {
            queryClient.setQueryData(["customer", id], updated);
            void queryClient.invalidateQueries({ queryKey: ["customers"] });
            setNotice(message);
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
        <thead><tr><th>Shop</th><th>City</th><th>Plan</th><th>Subscription</th><th>Status</th></tr></thead>
        <tbody>
          {customer.shops.length === 0 ? (
            <tr><td colSpan={5} className="empty-cell">No shops.</td></tr>
          ) : customer.shops.map((s) => (
            <tr key={s.id}>
              <td><span className="identity-name">{s.shopName}</span></td>
              <td className="muted">{s.city}</td>
              <td className="muted">{s.subscriptionPlanName ?? "—"}</td>
              <td><span className="badge">{s.subscriptionStatus}</span></td>
              <td>
                <span className={`status ${s.isActive ? "status--ok" : "status--warn"}`}>
                  <span className="dot" />{s.isActive ? "Active" : "Inactive"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UsersTab({
  customer,
  onResult,
}: {
  customer: CustomerDetail;
  onResult: (updated: CustomerDetail, message: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  // Customer users should never be granted the platform-operator role from here.
  const rolesQuery = useQuery({
    queryKey: ["roles"],
    queryFn: listRoles,
    select: (roles) => roles.filter((r) => r.name !== "PlatformAdmin"),
  });

  return (
    <div className="card table-wrap">
      {error ? <div className="error-banner">{error}</div> : null}
      <table className="table">
        <thead>
          <tr><th>User</th><th>Shop</th><th>Role</th><th>Last login</th><th>Status</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {customer.users.length === 0 ? (
            <tr><td colSpan={6} className="empty-cell">No users.</td></tr>
          ) : customer.users.map((u) => (
            <UserRow
              key={`${u.userId}-${u.shopId}`}
              companyId={customer.id}
              user={u}
              roles={rolesQuery.data ?? []}
              onResult={onResult}
              onError={setError}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserRow({
  companyId,
  user,
  roles,
  onResult,
  onError,
}: {
  companyId: string;
  user: CustomerUser;
  roles: { id: string; name: string }[];
  onResult: (updated: CustomerDetail, message: string) => void;
  onError: (message: string | null) => void;
}) {
  const [roleId, setRoleId] = useState(user.roleId);
  useEffect(() => setRoleId(user.roleId), [user.roleId]);

  const roleMutation = useMutation({
    mutationFn: () => assignCustomerUserRole(companyId, user.userId, user.shopId, roleId),
    onSuccess: (updated) => { onError(null); onResult(updated, `Role updated for ${user.fullName}.`); },
    onError: (e) => onError(getApiErrorMessage(e, "Failed to update role.")),
  });

  const activeMutation = useMutation({
    mutationFn: () => setCustomerUserActive(companyId, user.userId, user.shopId, !user.isActive),
    onSuccess: (updated) => {
      onError(null);
      onResult(updated, `${user.fullName} ${user.isActive ? "deactivated" : "activated"}.`);
    },
    onError: (e) => onError(getApiErrorMessage(e, "Failed to change status.")),
  });

  const busy = roleMutation.isPending || activeMutation.isPending;

  return (
    <tr>
      <td>
        <div className="identity">
          <span className="avatar">{userInitials(user.fullName, user.email)}</span>
          <div>
            <div className="identity-name">{user.fullName}</div>
            <div className="identity-sub">{user.email}</div>
          </div>
        </div>
      </td>
      <td className="muted">{user.shopName}</td>
      <td>
        <select value={roleId} onChange={(e) => setRoleId(e.target.value)} disabled={busy}>
          {roles.length === 0 ? <option value={user.roleId}>{user.roleName}</option> : null}
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </td>
      <td className="muted">{user.lastLoginOn ? new Date(user.lastLoginOn).toLocaleString() : "—"}</td>
      <td>
        <span className={`status ${user.isActive ? "status--ok" : "status--warn"}`}>
          <span className="dot" />{user.isActive ? "Active" : "Inactive"}
        </span>
      </td>
      <td>
        <div className="row-actions">
          <button
            className="btn btn-sm"
            disabled={busy || roleId === user.roleId}
            onClick={() => roleMutation.mutate()}
          >
            Save role
          </button>
          <button
            className={`btn btn-sm ${user.isActive ? "btn-danger" : "btn-success"}`}
            disabled={busy}
            onClick={() => activeMutation.mutate()}
          >
            {user.isActive ? "Deactivate" : "Activate"}
          </button>
        </div>
      </td>
    </tr>
  );
}

function SubscriptionTab({
  customer,
  onResult,
}: {
  customer: CustomerDetail;
  onResult: (updated: CustomerDetail, message: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const plansQuery = useQuery({ queryKey: ["plans"], queryFn: listPlans });

  return (
    <div className="card table-wrap">
      {error ? <div className="error-banner">{error}</div> : null}
      <table className="table">
        <thead>
          <tr><th>Shop</th><th>Current plan</th><th>Status</th><th>Assign plan</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {customer.shops.length === 0 ? (
            <tr><td colSpan={5} className="empty-cell">No shops to manage.</td></tr>
          ) : customer.shops.map((shop) => (
            <ShopSubscriptionRow
              key={shop.id}
              companyId={customer.id}
              shop={shop}
              plans={(plansQuery.data ?? []).map((p) => ({ id: p.id, label: `${p.name} · ${p.billingCycle} · £${p.pricePerShop}/shop` }))}
              onResult={onResult}
              onError={setError}
            />
          ))}
        </tbody>
      </table>
      <p className="muted" style={{ padding: "12px 18px 14px" }}>
        Subscriptions are managed per shop. Assigning a plan, cancelling, or reactivating affects only that shop.
      </p>
    </div>
  );
}

function ShopSubscriptionRow({
  companyId,
  shop,
  plans,
  onResult,
  onError,
}: {
  companyId: string;
  shop: ShopSummary;
  plans: { id: string; label: string }[];
  onResult: (updated: CustomerDetail, message: string) => void;
  onError: (message: string | null) => void;
}) {
  const [planId, setPlanId] = useState("");
  const isCancelled = shop.subscriptionStatus.toLowerCase().includes("cancel");

  const assignMutation = useMutation({
    mutationFn: () => selectShopPlan(companyId, shop.id, planId),
    onSuccess: (updated) => { onError(null); setPlanId(""); onResult(updated, `Plan assigned to ${shop.shopName}.`); },
    onError: (e) => onError(getApiErrorMessage(e, "Failed to assign plan.")),
  });
  const cancelMutation = useMutation({
    mutationFn: () => cancelShopSubscription(companyId, shop.id, true),
    onSuccess: (updated) => { onError(null); onResult(updated, `${shop.shopName} subscription cancellation scheduled.`); },
    onError: (e) => onError(getApiErrorMessage(e, "Failed to cancel.")),
  });
  const reactivateMutation = useMutation({
    mutationFn: () => reactivateShopSubscription(companyId, shop.id),
    onSuccess: (updated) => { onError(null); onResult(updated, `${shop.shopName} subscription reactivated.`); },
    onError: (e) => onError(getApiErrorMessage(e, "Failed to reactivate.")),
  });

  const busy = assignMutation.isPending || cancelMutation.isPending || reactivateMutation.isPending;

  return (
    <tr>
      <td><span className="identity-name">{shop.shopName}</span></td>
      <td className="muted">{shop.subscriptionPlanName ?? "—"}</td>
      <td><span className="badge">{shop.subscriptionStatus}</span></td>
      <td>
        <div className="row-actions">
          <select value={planId} onChange={(e) => setPlanId(e.target.value)} disabled={busy}>
            <option value="">Select a plan…</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <button className="btn btn-sm btn-primary" disabled={!planId || busy} onClick={() => assignMutation.mutate()}>
            Assign
          </button>
        </div>
      </td>
      <td>
        <div className="row-actions">
          {isCancelled ? (
            <button className="btn btn-sm btn-success" disabled={busy} onClick={() => reactivateMutation.mutate()}>
              Reactivate
            </button>
          ) : (
            <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => cancelMutation.mutate()}>
              Cancel
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function userInitials(name: string, email: string): string {
  const source = (name && name.trim()) || email || "";
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
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
