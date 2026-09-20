import { Link, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import { getNavLinksForRole } from "../../utils/roleAccess";
import { API_BASE } from "../../config/api";
import "../styles/navbar.css";


function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/notifications/unread-count`, {
        credentials: "include",
      });
      if (res.ok) {
        const d = await res.json();
        setUnreadCount(d.unreadCount || 0);
      }
    } catch { /* silent */ }
  }, []);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/notifications/view`, {
        credentials: "include",
      });
      if (res.ok) {
        const d = await res.json();
        setNotifications(d.notifications || []);
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  // Poll unread count every 30s
  useEffect(() => {
    fetchUnreadCount();
    const id = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(id);
  }, [fetchUnreadCount]);

  // Open dropdown → fetch notifications
  useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleMarkAllRead = async () => {
    await fetch(`${API_BASE}/notifications/mark-all-read`, {
      method: "PATCH",
      credentials: "include",
    });
    setNotifications([]);
    setUnreadCount(0);
  };

  const handleClickNotification = async (n) => {
    // Mark as read (deleted from DB) — no navigation, just dismiss
    await fetch(`${API_BASE}/notifications/${n.id}/read`, {
      method: "PATCH",
      credentials: "include",
    });
    setNotifications((prev) => prev.filter((item) => item.id !== n.id));
    setUnreadCount((c) => Math.max(0, c - 1));
    // Dropdown stays open so user can read all notifications
  };

  return (
    <div className="nav-bell-wrap" ref={dropdownRef}>
      <button
        id="nav-notification-bell"
        className="nav-bell-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        aria-expanded={open}
      >
        <svg className="nav-bell-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="nav-bell-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="nav-notif-dropdown" role="dialog" aria-label="Notifications">
          <div className="nav-notif-header">
            <span className="nav-notif-title">Notifications</span>
            {unreadCount > 0 && (
              <button className="nav-notif-mark-all" onClick={handleMarkAllRead}>
                Mark all read
              </button>
            )}
          </div>

          <div className="nav-notif-body">
            {loading ? (
              <div className="nav-notif-loading">
                <span className="nav-notif-spinner" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="nav-notif-empty">
                🔔 No notifications yet
              </div>
            ) : (
              notifications.map((n) => {
                const isUnread = n.status !== "read";
                return (
                  <button
                    key={n.id}
                    className={`nav-notif-item ${isUnread ? "unread" : ""}`}
                    onClick={() => handleClickNotification(n)}
                  >
                    <div className="nav-notif-msg">{n.message}</div>
                    <div className="nav-notif-meta">
                      {isUnread && <span className="nav-notif-dot" />}
                      <span className="nav-notif-time">{timeAgo(n.createdAt)}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Navbar() {
  const navigate = useNavigate();
  const { user, isLoggedIn, checkingAuth, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const links = getNavLinksForRole(user?.role, isLoggedIn);

  // Close mobile drawer on route change or ESC
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  const handleLogout = async () => {
    setMobileMenuOpen(false);
    await logout();
    navigate("/login");
  };

  return (
    <>
      <nav className="nav">
        <Link to="/" className="nav-logo" onClick={() => setMobileMenuOpen(false)}>
          <div className="nav-logo-icon">🩸</div>
          <span className="nav-logo-text">
            Blood<span>Bank</span>
          </span>
        </Link>

        {/* Desktop Navigation Links */}
        <div className="nav-links">
          {links.map((link) => (
            <Link key={link.path} to={link.path}>
              {link.name}
            </Link>
          ))}
        </div>

        {/* Header Right Actions */}
        <div className="nav-actions">
          {!checkingAuth && isLoggedIn && <NotificationBell />}
          
          <div className="nav-desktop-auth">
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

          {/* Mobile Hamburger Toggle Button */}
          <button
            type="button"
            className={`nav-hamburger-btn ${mobileMenuOpen ? "open" : ""}`}
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            <span className="hamburger-bar"></span>
            <span className="hamburger-bar"></span>
            <span className="hamburger-bar"></span>
          </button>
        </div>
      </nav>

      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div
          className="nav-drawer-overlay"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile Slide-in Drawer */}
      <div
        className={`nav-mobile-drawer ${mobileMenuOpen ? "drawer-open" : ""}`}
        role="dialog"
        aria-label="Mobile Navigation"
      >
        <div className="drawer-header">
          <div className="drawer-brand">
            <span className="drawer-logo-icon">🩸</span>
            <span className="drawer-logo-text">Blood<span>Bank</span></span>
          </div>
          <button
            type="button"
            className="drawer-close-btn"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        {isLoggedIn && user && (
          <div className="drawer-user-card">
            <div className="drawer-avatar">
              {user.fullName ? user.fullName[0].toUpperCase() : "U"}
            </div>
            <div className="drawer-user-info">
              <div className="drawer-user-name">{user.fullName || user.username}</div>
              <div className="drawer-user-role">
                <span className="role-tag">{user.role?.toUpperCase()}</span>
                {user.bloodGroup && <span className="blood-tag">{user.bloodGroup}</span>}
              </div>
            </div>
          </div>
        )}

        <div className="drawer-links">
          {links.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className="drawer-link-item"
              onClick={() => setMobileMenuOpen(false)}
            >
              <span>{link.name}</span>
              <span className="drawer-link-arrow">→</span>
            </Link>
          ))}
        </div>

        <div className="drawer-footer">
          {!checkingAuth && !isLoggedIn && (
            <div className="drawer-auth-buttons">
              <Link
                to="/login"
                className="drawer-btn-primary"
                onClick={() => setMobileMenuOpen(false)}
              >
                Sign In
              </Link>
              <Link
                to="/register"
                className="drawer-btn-secondary"
                onClick={() => setMobileMenuOpen(false)}
              >
                Create Account
              </Link>
            </div>
          )}
          {!checkingAuth && isLoggedIn && (
            <button className="drawer-btn-logout" onClick={handleLogout}>
              Log Out
            </button>
          )}
        </div>
      </div>
    </>
  );
}