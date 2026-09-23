import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function RequireAuth({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="login-page"><p className="muted">Checking your session…</p></div>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}
