import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { listShops } from "../api/shops";
import { getApiErrorMessage } from "../api/client";

const PAGE_SIZE = 20;

export function ShopsListPage() {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ["shops", search, page],
    queryFn: () => listShops(search, page, PAGE_SIZE),
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
        <h1>Shops</h1>
        <form className="search-row" onSubmit={onSearch}>
          <input
            placeholder="Search by shop or company name"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <button className="btn" type="submit">Search</button>
        </form>
      </div>

      {query.isError ? (
        <div className="error-banner">{getApiErrorMessage(query.error, "Failed to load shops.")}</div>
      ) : null}

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Shop</th>
              <th>Company</th>
              <th>City</th>
              <th>Plan</th>
              <th>Subscription</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading ? (
              <tr><td colSpan={6} className="empty-cell">Loading…</td></tr>
            ) : data && data.items.length > 0 ? (
              data.items.map((s) => (
                <tr
                  key={s.id}
                  className={s.companyId ? "row-clickable" : undefined}
                  onClick={() => s.companyId && navigate(`/customers/${s.companyId}`)}
                >
                  <td><span className="identity-name">{s.shopName}</span></td>
                  <td className="muted">{s.companyName || "—"}</td>
                  <td className="muted">{s.city || "—"}</td>
                  <td className="muted">{s.subscriptionPlanName ?? "—"}</td>
                  <td><span className="badge">{s.subscriptionStatus}</span></td>
                  <td>
                    <span className={`status ${s.isActive ? "status--ok" : "status--warn"}`}>
                      <span className="dot" />{s.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={6} className="empty-cell">No shops found.</td></tr>
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
