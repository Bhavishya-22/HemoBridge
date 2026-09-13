import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import "../styles/dashboard.css";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

export default function HospitalDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState("");

  useEffect(() => {
    if (user && user.role !== "hospital") {
      navigate("/home", { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    const fetchPending = async () => {
      try {
        const res = await fetch(`${API_BASE}/requests/hospital`, { credentials: "include" });
        if (res.ok) {
          const d = await res.json();
          setPendingRequests(d.requests || []);
        }
      } catch (e) {
        console.error("Hospital dashboard fetch error:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchPending();
  }, []);

  const handleVerify = async (requestId, action) => {
    try {
      const res = await fetch(`${API_BASE}/hospital/verify-request/${requestId}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMsg(`Request ${action === "approve" ? "approved" : "rejected"} successfully.`);
        setPendingRequests((prev) => prev.filter((r) => r._id !== requestId));
      } else {
        setActionMsg(data.message || "Action failed.");
      }
    } catch {
      setActionMsg("Server error. Please try again.");
    }
    setTimeout(() => setActionMsg(""), 4000);
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  if (!user || user.role !== "hospital") return null;

  const isVerified = user.hospitalVerified;

  return (
    <div className="dash-page">
      <aside className="dash-sidebar">
        <div className="dash-brand">
          <span className="dash-brand-icon">??</span>
          <span className="dash-brand-name">Blood<span>Bank</span></span>
        </div>
        <nav className="dash-nav">
          <span className="dash-nav-label">Hospital Panel</span>
          <a href="#overview" className="dash-nav-item active">?? Overview</a>
          <a href="#requests" className="dash-nav-item">?? Pending Requests</a>
        </nav>
        <div className="dash-user-block">
          <div className="dash-avatar">??</div>
          <div>
            <p className="dash-user-name">{user.hospitalName || user.fullName}</p>
            <p className="dash-user-role">Hospital</p>
          </div>
          <button className="dash-logout-btn" onClick={handleLogout} title="Logout">?</button>
        </div>
      </aside>
      <main className="dash-main">
        <header className="dash-topbar">
          <div>
            <h1 className="dash-page-title">Hospital Dashboard</h1>
            <p className="dash-page-sub">Verify blood requests and manage donor matching.</p>
          </div>
          <div className={`dash-topbar-badge ${isVerified ? "verified-badge" : "pending-badge"}`}>
            {isVerified ? "? Verified" : "? Verification Pending"}
          </div>
        </header>
        {!isVerified && (
          <div className="dash-alert warning">
            ?? Your hospital account is pending admin verification. You can view requests but cannot approve them until verified.
          </div>
        )}
        {actionMsg && <div className="dash-toast">{actionMsg}</div>}
        <section id="overview" className="dash-stats-grid">
          <div className="dash-stat-card">
            <span className="dash-stat-icon">??</span>
            <div>
              <p className="dash-stat-label">Pending Requests</p>
              <p className="dash-stat-value">{pendingRequests.length}</p>
            </div>
          </div>
          <div className="dash-stat-card">
            <span className="dash-stat-icon">??</span>
            <div>
              <p className="dash-stat-label">Hospital Status</p>
              <p className="dash-stat-value" style={{ fontSize: "1rem" }}>{isVerified ? "Verified ?" : "Pending ?"}</p>
            </div>
          </div>
        </section>
        <section id="requests" className="dash-section">
          <h2 className="dash-section-title">?? Blood Requests Awaiting Verification</h2>
          {loading ? (
            <div className="dash-loading"><span className="dash-spinner" /></div>
          ) : pendingRequests.length === 0 ? (
            <div className="dash-empty">No pending requests at the moment. ?</div>
          ) : (
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Blood Group</th>
                    <th>Quantity</th>
                    <th>Emergency</th>
                    <th>Requested By</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingRequests.map((r) => (
                    <tr key={r._id}>
                      <td><span className="blood-badge">{r.bloodGroup}</span></td>
                      <td>{r.quantity} unit{r.quantity > 1 ? "s" : ""}</td>
                      <td><span className={`emergency-badge ${r.emergencyLevel}`}>{r.emergencyLevel}</span></td>
                      <td>{r.requestedBy?.fullName || "—"}</td>
                      <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                      <td className="dash-actions">
                        <button
                          className="dash-btn approve"
                          onClick={() => handleVerify(r._id, "approve")}
                          disabled={!isVerified}
                        >Approve</button>
                        <button
                          className="dash-btn reject"
                          onClick={() => handleVerify(r._id, "reject")}
                          disabled={!isVerified}
                        >Reject</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
