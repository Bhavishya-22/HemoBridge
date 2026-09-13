import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import "../styles/dashboard.css";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [pendingHospitals, setPendingHospitals] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [actionMsg, setActionMsg] = useState("");

  useEffect(() => {
    if (user && user.role !== "admin") {
      navigate("/home", { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [hospRes, reqRes] = await Promise.all([
          fetch(`${API_BASE}/admin/pending-hospitals`, { credentials: "include" }),
          fetch(`${API_BASE}/admin/all-requests`, { credentials: "include" }),
        ]);
        if (hospRes.ok) {
          const d = await hospRes.json();
          setPendingHospitals(d.hospitals || []);
        }
        if (reqRes.ok) {
          const d = await reqRes.json();
          setRequests(d.requests || []);
        }
      } catch (e) {
        console.error("Dashboard fetch error:", e);
      } finally {
        setLoadingStats(false);
      }
    };
    fetchData();
  }, []);

  const handleVerifyHospital = async (hospitalId, action) => {
    try {
      const res = await fetch(`${API_BASE}/admin/verify-hospital/${hospitalId}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, notes: action === "approve" ? "Verified by admin" : "Rejected by admin" }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMsg(`Hospital ${action === "approve" ? "approved" : "rejected"} successfully.`);
        setPendingHospitals((prev) => prev.filter((h) => h._id !== hospitalId));
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

  if (!user || user.role !== "admin") return null;

  return (
    <div className="dash-page">
      <aside className="dash-sidebar">
        <div className="dash-brand">
          <span className="dash-brand-icon">??</span>
          <span className="dash-brand-name">Blood<span>Bank</span></span>
        </div>
        <nav className="dash-nav">
          <span className="dash-nav-label">Admin Panel</span>
          <a href="#overview" className="dash-nav-item active">?? Overview</a>
          <a href="#hospitals" className="dash-nav-item">?? Hospital Approvals</a>
          <a href="#requests" className="dash-nav-item">?? Blood Requests</a>
        </nav>
        <div className="dash-user-block">
          <div className="dash-avatar">??</div>
          <div>
            <p className="dash-user-name">{user.fullName || user.username}</p>
            <p className="dash-user-role">Administrator</p>
          </div>
          <button className="dash-logout-btn" onClick={handleLogout} title="Logout">?</button>
        </div>
      </aside>
      <main className="dash-main">
        <header className="dash-topbar">
          <div>
            <h1 className="dash-page-title">Admin Dashboard</h1>
            <p className="dash-page-sub">Manage hospitals, blood requests, and system health.</p>
          </div>
          <div className="dash-topbar-badge admin-badge">?? Administrator</div>
        </header>
        {actionMsg && <div className="dash-toast">{actionMsg}</div>}
        <section id="overview" className="dash-stats-grid">
          <div className="dash-stat-card">
            <span className="dash-stat-icon">??</span>
            <div>
              <p className="dash-stat-label">Pending Hospitals</p>
              <p className="dash-stat-value">{pendingHospitals.length}</p>
            </div>
          </div>
          <div className="dash-stat-card">
            <span className="dash-stat-icon">??</span>
            <div>
              <p className="dash-stat-label">Total Requests</p>
              <p className="dash-stat-value">{requests.length}</p>
            </div>
          </div>
          <div className="dash-stat-card">
            <span className="dash-stat-icon">?</span>
            <div>
              <p className="dash-stat-label">Fulfilled</p>
              <p className="dash-stat-value">{requests.filter((r) => r.status === "final_completed").length}</p>
            </div>
          </div>
          <div className="dash-stat-card">
            <span className="dash-stat-icon">?</span>
            <div>
              <p className="dash-stat-label">Awaiting Approval</p>
              <p className="dash-stat-value">{requests.filter((r) => r.status === "pending_hospital_approval").length}</p>
            </div>
          </div>
        </section>
        <section id="hospitals" className="dash-section">
          <h2 className="dash-section-title">?? Pending Hospital Verifications</h2>
          {loadingStats ? (
            <div className="dash-loading"><span className="dash-spinner" /></div>
          ) : pendingHospitals.length === 0 ? (
            <div className="dash-empty">No hospitals awaiting verification. ?</div>
          ) : (
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead><tr><th>Hospital Name</th><th>Reg. Number</th><th>Email</th><th>Actions</th></tr></thead>
                <tbody>
                  {pendingHospitals.map((h) => (
                    <tr key={h._id}>
                      <td>{h.hospitalName || h.fullName}</td>
                      <td>{h.registrationNumber || "—"}</td>
                      <td>{h.email}</td>
                      <td className="dash-actions">
                        <button className="dash-btn approve" onClick={() => handleVerifyHospital(h._id, "approve")}>Approve</button>
                        <button className="dash-btn reject" onClick={() => handleVerifyHospital(h._id, "reject")}>Reject</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section id="requests" className="dash-section">
          <h2 className="dash-section-title">?? All Blood Requests</h2>
          {loadingStats ? (
            <div className="dash-loading"><span className="dash-spinner" /></div>
          ) : requests.length === 0 ? (
            <div className="dash-empty">No blood requests found.</div>
          ) : (
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead><tr><th>Blood Group</th><th>Qty</th><th>Emergency</th><th>Status</th><th>Created</th></tr></thead>
                <tbody>
                  {requests.slice(0, 20).map((r) => (
                    <tr key={r._id}>
                      <td><span className="blood-badge">{r.bloodGroup}</span></td>
                      <td>{r.quantity} unit{r.quantity > 1 ? "s" : ""}</td>
                      <td><span className={`emergency-badge ${r.emergencyLevel}`}>{r.emergencyLevel}</span></td>
                      <td><span className={`status-badge status-${r.status?.replace(/_/g, "-")}`}>{r.status?.replace(/_/g, " ")}</span></td>
                      <td>{new Date(r.createdAt).toLocaleDateString()}</td>
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
