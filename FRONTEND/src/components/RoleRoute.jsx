import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getRoleHomePath } from "../utils/roleAccess";
import "../App/styles/bloodFlow.css";

export function RequireAuth({ children }) {
  const { isLoggedIn, checkingAuth } = useAuth();
  const location = useLocation();

  if (checkingAuth) {
    return (
      <div className="flow-page flow-loading">
        <span className="flow-spinner" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}

export default function RoleRoute({ allowedRoles, requireProfile = true, children }) {
  const { user, isLoggedIn, checkingAuth } = useAuth();
  const location = useLocation();

  if (checkingAuth) {
    return (
      <div className="flow-page flow-loading">
        <span className="flow-spinner" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={getRoleHomePath(user.role)} replace />;
  }

  if (requireProfile && user.role !== "admin" && user.role !== "receiver" && !user.profileCompleted) {
    return <Navigate to="/profile" replace />;
  }

  return children;
}
