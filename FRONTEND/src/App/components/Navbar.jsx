import "../styles/navbar.css";
import { Link } from "react-router-dom";

const links = [
  { name: "Home", path: "/" },
  { name: "Request Blood", path: "/request" },
  { name: "Donate Blood", path: "/donate" },
  { name: "FAQ", path: "/faq" },
  { name: "Profile", path: "/profile" },
];


export default function Navbar() {
  return (
    <nav className="nav">
      <a href="#" className="nav-logo">
        <div className="nav-logo-icon">🩸</div>
        <span className="nav-logo-text">Blood<span>Bank</span></span>
      </a>
      <div className="nav-links">
        {links.map(link => (
          <Link key={link.path} to={link.path}>
            {link.name}
          </Link>
        ))}
      </div>
      <div className="nav-actions">
        <button className="btn-ghost">Login</button>
        <button className="btn-primary">Register</button>
      </div>
    </nav>
  );
}