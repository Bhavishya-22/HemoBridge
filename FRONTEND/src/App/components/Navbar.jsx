import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { getNavLinksForRole } from "../../utils/roleAccess";
import "../styles/navbar.css";

export default function Navbar() {
  const navigate = useNavigate();
  const { user, isLoggedIn, checkingAuth, logout } = useAuth();
  const links = getNavLinksForRole(user?.role, isLoggedIn);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <nav className="nav">
      <Link to="/" className="nav-logo">
        <div className="nav-logo-icon">🩸</div>
        <span className="nav-logo-text">
          Blood<span>Bank</span>
        </span>
      </Link>

      <div className="nav-links">
        {links.map((link) => (
          <Link key={link.path} to={link.path}>
            {link.name}
          </Link>
        ))}
      </div>

      <div className="nav-actions">
        {!checkingAuth && !isLoggedIn && (
          <Link to="/login">
            <button className="btn-ghost">Login</button>
          </Link>
        )}
        {!checkingAuth && isLoggedIn && (
          <button className="btn-ghost" onClick={handleLogout}>
            Logout
          </button>
        )}
      </div>
    </nav>
  );
}