import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../styles/navbar.css";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

const links = [
  { name: "Home", path: "/" },
  { name: "Request Blood", path: "/request" },
  { name: "Donate Blood", path: "/donate" },
  { name: "FAQ", path: "/faq" },
  { name: "Profile", path: "/profile" },
];

export default function Navbar() {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(null); // null = unknown/checking

  useEffect(() => {
    const controller = new AbortController();

    fetch(`${API_BASE}/user/profile`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then((res) => setIsLoggedIn(res.ok))
      .catch((err) => {
        if (err.name !== "AbortError") setIsLoggedIn(false);
      });

    return () => controller.abort();
  }, []);

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.error("Logout request failed:", err);
    } finally {
      setIsLoggedIn(false);
      navigate("/login");
    }
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
        {isLoggedIn === false && (
          <Link to="/login">
            <button className="btn-ghost">Login</button>
          </Link>
        )}
        {isLoggedIn === true && (
          <button className="btn-ghost" onClick={handleLogout}>
            Logout
          </button>
        )}
      </div>
    </nav>
  );
}