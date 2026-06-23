import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import "../styles/navbar.css";

const links = [
  { name: "Home", path: "/" },
  { name: "Request Blood", path: "/request" },
  { name: "Donate Blood", path: "/donate" },
  { name: "FAQ", path: "/faq" },
  { name: "Profile", path: "/profile" },
];

export default function Navbar() {
  const navigate = useNavigate();
  const { isLoggedIn, checkingAuth, logout } = useAuth();

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