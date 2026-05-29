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
              <tr><td colSpan={6} className="muted">Loading…</td></tr>
            ) : data && data.items.length > 0 ? (
              data.items.map((c) => (
                <tr key={c.id} className="row-clickable" onClick={() => navigate(`/customers/${c.id}`)}>
                  <td>{c.companyName}</td>
                  <td className="muted">{c.email}</td>
                  <td className="num">{c.shopCount}</td>
                  <td className="num">{c.userCount}</td>
                  <td><span className="badge">{c.subscriptionStatus}</span></td>
                  <td>
                    <span className={`badge ${c.isActive ? "badge-ok" : "badge-warn"}`}>{c.status}</span>
                  </td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={6} className="muted">No customers found.</td></tr>
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
