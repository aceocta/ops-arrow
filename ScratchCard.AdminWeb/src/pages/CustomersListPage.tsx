import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { listCustomers } from "../api/customers";
import { getApiErrorMessage } from "../api/client";

const PAGE_SIZE = 20;

export function CustomersListPage() {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ["customers", search, page],
    queryFn: () => listCustomers(search, page, PAGE_SIZE),
    placeholderData: keepPreviousData,
  });

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const data = query.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.totalCount / PAGE_SIZE)) : 1;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Customers</h1>
        <form className="search-row" onSubmit={onSearch}>
          <input
            placeholder="Search by company name or email"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <button className="btn" type="submit">Search</button>
        </form>
      </div>

      {data ? (
        <div className="list-summary" role="group" aria-label="Customers summary">
          <div className="list-summary__stat">
            <span className="list-summary__value">{data.totalCount}</span>
            <span className="list-summary__label">Total</span>
          </div>
          <div className="list-summary__stat">
            <span className="list-summary__value">{data.items.filter((c) => c.isActive).length}</span>
            <span className="list-summary__label">Active (page)</span>
          </div>
          <div className="list-summary__stat">
            <span className="list-summary__value">{data.items.filter((c) => !c.isActive).length}</span>
            <span className="list-summary__label">Inactive (page)</span>
          </div>
        </div>
      ) : null}

      {query.isError ? (
        <div className="error-banner">{getApiErrorMessage(query.error, "Failed to load customers.")}</div>
      ) : null}

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Email</th>
              <th className="num">Shops</th>
              <th className="num">Users</th>
              <th>Subscription</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading ? (
              <tr><td colSpan={6} className="empty-cell">Loading…</td></tr>
            ) : data && data.items.length > 0 ? (
              data.items.map((c) => (
                <tr key={c.id} className="row-clickable" onClick={() => navigate(`/customers/${c.id}`)}>
                  <td data-label="Company"><span className="identity-name">{c.companyName}</span></td>
                  <td data-label="Email" className="muted">{c.email || "—"}</td>
                  <td data-label="Shops" className="num">{c.shopCount}</td>
                  <td data-label="Users" className="num">{c.userCount}</td>
                  <td data-label="Subscription"><span className="badge">{c.subscriptionStatus}</span></td>
                  <td data-label="Status">
                    <span className={`status ${c.isActive ? "status--ok" : "status--warn"}`}>
                      <span className="dot" />{c.status}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={6} className="empty-cell">No customers found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pager">
        <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
        <span className="muted">Page {page} of {totalPages}{data ? ` · ${data.totalCount} total` : ""}</span>
        <button className="btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
      </div>
    </div>
  );
}
