import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

export function RequireAuth({ children }: { children: JSX.Element }) {
  const { isAuthenticated, isPlatformAdmin } = useAuth();
  const location = useLocation();

  if (!isAuthenticated || !isPlatformAdmin) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
}
