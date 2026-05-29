import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

function initials(name?: string, email?: string): string {
  const source = (name && name.trim()) || email || "";
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const navIcon = {
  customers: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  shops: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l1.5-5h15L21 9" />
      <path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9" />
      <path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" />
    </svg>
  ),
};

const hamburgerIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

export function Layout({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const name = profile?.displayName || profile?.email || "";
  const [navOpen, setNavOpen] = useState(false);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setNavOpen(false), [location.pathname]);

  return (
    <div className="app-shell">
      {navOpen ? <div className="sidebar-overlay" onClick={() => setNavOpen(false)} /> : null}

      <aside className={`sidebar${navOpen ? " open" : ""}`}>
        <Link to="/customers" className="sidebar-brand">
          <span className="brand-mark">OA</span>
          <span>Ops Arrow <span className="brand-sub">Admin</span></span>
        </Link>
        <nav className="sidebar-nav">
          <NavLink to="/customers" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
            {navIcon.customers}<span>Customers</span>
          </NavLink>
          <NavLink to="/shops" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
            {navIcon.shops}<span>Shops</span>
          </NavLink>
        </nav>
      </aside>

      <div className="app-body">
        <header className="topbar">
          <button
            className="nav-toggle"
            aria-label="Toggle navigation"
            onClick={() => setNavOpen((v) => !v)}
          >
            {hamburgerIcon}
          </button>
          <div className="header-right">
            <span className="user-chip">
              <span className="avatar avatar--sm">{initials(profile?.displayName, profile?.email)}</span>
              <span className="header-user">{name}</span>
            </span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                signOut();
                navigate("/login", { replace: true });
              }}
            >
              Log out
            </button>
          </div>
        </header>
        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}
