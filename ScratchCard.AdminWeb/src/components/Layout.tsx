import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function Layout({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/customers" className="brand">
          Ops Arrow <span className="brand-sub">Admin</span>
        </Link>
        <div className="header-right">
          <span className="header-user">{profile?.displayName || profile?.email}</span>
          <button
            className="btn btn-ghost"
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
  );
}
