import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { formatRequestStatus } from "../../utils/roleAccess";
import "../styles/dashboard.css";

import { API_BASE } from "../../config/api";

export default function HospitalDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [pendingRequests, setPendingRequests] = useState([]);
  const [testingRequests, setTestingRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingTesting, setLoadingTesting] = useState(true);
  const [actionMsg, setActionMsg] = useState("");
  const [busyId, setBusyId] = useState(null);

  // Modals
  const [scheduleModal, setScheduleModal] = useState({ open: false, request: null, date: "" });
  const [rejectModal, setRejectModal] = useState({ open: false, request: null, reason: "" });

  useEffect(() => {
    if (user && user.role !== "hospital") {
      navigate("/home", { replace: true });
    }
  }, [user, navigate]);

  const fetchPending = async () => {
    try {
      const res = await fetch(`${API_BASE}/hospital/requests`, { credentials: "include" });
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

  const fetchTesting = async () => {
    try {
      const res = await fetch(`${API_BASE}/hospital/pending-blood-tests`, {
        credentials: "include",
      });
      if (res.ok) {
        const d = await res.json();
        setTestingRequests(d.requests || []);
      }
    } catch (e) {
      console.error("Hospital testing fetch error:", e);
    } finally {
      setLoadingTesting(false);
    }
  };

  useEffect(() => {
    fetchPending();
    fetchTesting();
  }, []);

  const handleVerify = async (requestId, action) => {
    const endpoint =
      action === "approve"
        ? `${API_BASE}/hospital/approve-request/${requestId}`
        : `${API_BASE}/hospital/reject-request/${requestId}`;

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "reject" ? { rejectionReason: "Rejected by hospital" } : {}
        ),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMsg(`Request ${action === "approve" ? "approved" : "rejected"} successfully.`);
        setPendingRequests((prev) => prev.filter((r) => r._id !== requestId));
        fetchTesting();
      } else {
        setActionMsg(data.message || "Action failed.");
      }
    } catch {
      setActionMsg("Server error. Please try again.");
    }
    setTimeout(() => setActionMsg(""), 4000);
  };

  // Schedule blood test
  const handleScheduleSubmit = async (e) => {
    e.preventDefault();
    if (!scheduleModal.request) return;

    setBusyId(scheduleModal.request.requestId);
    try {
      const res = await fetch(
        `${API_BASE}/hospital/schedule-blood-test/${scheduleModal.request.requestId}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ testScheduleDate: scheduleModal.date || "Scheduled at hospital" }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        setActionMsg("Blood test scheduled successfully! Ready for verification.");
        setScheduleModal({ open: false, request: null, date: "" });
        await fetchTesting();
      } else {
        setActionMsg(data.message || "Failed to schedule blood test.");
      }
    } catch {
      setActionMsg("Server error scheduling test.");
    } finally {
      setBusyId(null);
      setTimeout(() => setActionMsg(""), 4000);
    }
  };

  // Verify blood test (Pass)
  const handleVerifyBloodTest = async (reqItem) => {
    const targetId = reqItem.donationId || reqItem.requestId;
    setBusyId(reqItem.requestId);
    try {
      const res = await fetch(`${API_BASE}/donations/${targetId}/verify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isVerified: true, verificationNotes: "Blood test verified successfully by hospital" }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMsg("🎉 Blood test verified! Request completed and thank you notes dispatched.");
        await fetchTesting();
      } else {
        setActionMsg(data.message || "Failed to verify donation.");
      }
    } catch {
      setActionMsg("Server error verifying donation.");
    } finally {
      setBusyId(null);
      setTimeout(() => setActionMsg(""), 4000);
    }
  };

  // Reject blood test (Fail -> auto promote backup)
  const handleRejectSubmit = async (e) => {
    e.preventDefault();
    if (!rejectModal.request) return;

    const targetId = rejectModal.request.donationId || rejectModal.request.requestId;
    setBusyId(rejectModal.request.requestId);
    try {
      const res = await fetch(`${API_BASE}/donations/${targetId}/verify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isVerified: false,
          verificationNotes: rejectModal.reason || "Blood test rejected by hospital during verification",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMsg(
          data.message || "Blood test marked as failed. Next backup donor auto-promoted!"
        );
        setRejectModal({ open: false, request: null, reason: "" });
        await fetchTesting();
      } else {
        setActionMsg(data.message || "Failed to reject donation.");
      }
    } catch {
      setActionMsg("Server error rejecting donation.");
    } finally {
      setBusyId(null);
      setTimeout(() => setActionMsg(""), 5000);
    }
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
          <span className="dash-brand-icon">🩸</span>
          <span className="dash-brand-name">
            Blood<span>Bank</span>
          </span>
        </div>
        <nav className="dash-nav">
          <span className="dash-nav-label">Hospital Panel</span>
          <a href="#overview" className="dash-nav-item active">
            Overview
          </a>
          <a href="#requests" className="dash-nav-item">
            Pending Approvals ({pendingRequests.length})
          </a>
          <a href="#testing" className="dash-nav-item">
            Blood Testing & Matching ({testingRequests.length})
          </a>
        </nav>
        <div className="dash-user-block">
          <div className="dash-avatar">🏥</div>
          <div>
            <p className="dash-user-name">{user.hospitalName || user.fullName}</p>
            <p className="dash-user-role">Hospital</p>
          </div>
          <button className="dash-logout-btn" onClick={handleLogout} title="Logout">
            Logout
          </button>
        </div>
      </aside>
      <main className="dash-main">
        <header className="dash-topbar">
          <div>
            <h1 className="dash-page-title">Hospital Dashboard</h1>
            <p className="dash-page-sub">Verify blood requests, schedule tests, and verify donor blood.</p>
          </div>
          <div className={`dash-topbar-badge ${isVerified ? "verified-badge" : "pending-badge"}`}>
            {isVerified ? "Verified" : "Verification Pending"}
          </div>
        </header>
        {!isVerified && (
          <div className="dash-alert warning">
            Your hospital account is pending admin verification. You can view requests but cannot
            approve them until verified.
          </div>
        )}
        {actionMsg && <div className="dash-toast">{actionMsg}</div>}

        <section id="overview" className="dash-stats-grid">
          <div className="dash-stat-card">
            <span className="dash-stat-icon">📋</span>
            <div>
              <p className="dash-stat-label">Pending Initial Approvals</p>
              <p className="dash-stat-value">{pendingRequests.length}</p>
            </div>
          </div>
          <div className="dash-stat-card">
            <span className="dash-stat-icon">🧪</span>
            <div>
              <p className="dash-stat-label">Testing & Matched Donors</p>
              <p className="dash-stat-value">{testingRequests.length}</p>
            </div>
          </div>
          <div className="dash-stat-card">
            <span className="dash-stat-icon">🏥</span>
            <div>
              <p className="dash-stat-label">Hospital Status</p>
              <p className="dash-stat-value" style={{ fontSize: "1rem" }}>
                {isVerified ? "Verified" : "Pending"}
              </p>
            </div>
          </div>
        </section>

        {/* Section 1: Initial Request Approval */}
        <section id="requests" className="dash-section">
          <h2 className="dash-section-title">Blood Requests Awaiting Verification</h2>
          {loading ? (
            <div className="dash-loading">
              <span className="dash-spinner" />
            </div>
          ) : pendingRequests.length === 0 ? (
            <div className="dash-empty">No pending requests at the moment.</div>
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
                      <td>
                        <span className="blood-badge">{r.bloodGroup}</span>
                      </td>
                      <td>
                        {r.quantity} unit{r.quantity > 1 ? "s" : ""}
                      </td>
                      <td>
                        <span className={`emergency-badge ${r.emergencyLevel}`}>{r.emergencyLevel}</span>
                      </td>
                      <td>{r.requestedBy?.fullName || "-"}</td>
                      <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                      <td className="dash-actions">
                        <button
                          className="dash-btn approve"
                          onClick={() => handleVerify(r._id, "approve")}
                          disabled={!isVerified}
                        >
                          Approve
                        </button>
                        <button
                          className="dash-btn reject"
                          onClick={() => handleVerify(r._id, "reject")}
                          disabled={!isVerified}
                        >
                          Reject
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Section 2: Blood Testing & Verification (Issue 1) */}
        <section id="testing" className="dash-section" style={{ marginTop: "2.5rem" }}>
          <h2 className="dash-section-title">🧪 Matched Requests & Blood Testing Verification</h2>
          <p style={{ color: "#9ca3af", fontSize: "0.88rem", marginBottom: "1.25rem" }}>
            When a donor accepts and is selected by the nearest-donor system, schedule their blood test here.
            Once tested, verify or reject the blood. Rejection will automatically promote the next backup donor.
          </p>

          {loadingTesting ? (
            <div className="dash-loading">
              <span className="dash-spinner" />
            </div>
          ) : testingRequests.length === 0 ? (
            <div className="dash-empty">No matched or testing blood requests at this time.</div>
          ) : (
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Blood / Quantity</th>
                    <th>Receiver</th>
                    <th>Confirmed Donor</th>
                    <th>Donor Health</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {testingRequests.map((reqItem) => {
                    const donor = reqItem.confirmedDonor;
                    const receiver = reqItem.receiver;
                    const isScheduled = reqItem.status === "blood_test_scheduled";

                    return (
                      <tr key={reqItem.requestId}>
                        <td>
                          <span className="blood-badge">{reqItem.bloodGroup}</span>
                          <span style={{ marginLeft: "0.5rem", fontSize: "0.85rem", color: "#cbd5e1" }}>
                            {reqItem.quantity} unit{reqItem.quantity > 1 ? "s" : ""}
                          </span>
                          <div style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: "0.2rem" }}>
                            <span className={`emergency-badge ${reqItem.emergencyLevel}`}>{reqItem.emergencyLevel}</span>
                          </div>
                        </td>
                        <td>
                          <strong style={{ color: "#f1f5f9" }}>{receiver?.fullName || "Patient"}</strong>
                          <div style={{ fontSize: "0.8rem", color: "#9ca3af" }}>
                            📞 {receiver?.phoneNumber || "—"}
                          </div>
                        </td>
                        <td>
                          {donor ? (
                            <>
                              <strong style={{ color: "#f87171" }}>{donor.fullName}</strong>
                              <div style={{ fontSize: "0.8rem", color: "#9ca3af" }}>
                                📞 {donor.phoneNumber || "—"}
                              </div>
                            </>
                          ) : (
                            <span style={{ color: "#9ca3af" }}>No donor confirmed</span>
                          )}
                        </td>
                        <td>
                          {donor ? (
                            <div style={{ fontSize: "0.8rem", color: "#cbd5e1", lineHeight: 1.4 }}>
                              <div>Wt: <strong>{donor.weight ? `${donor.weight} kg` : "—"}</strong> · Ht: <strong>{donor.height ? `${donor.height} cm` : "—"}</strong></div>
                              <div style={{ color: donor.diseases?.length ? "#fca5a5" : "#86efac" }}>
                                {donor.diseases?.length ? donor.diseases.join(", ") : "Healthy / No reported conditions"}
                              </div>
                            </div>
                          ) : "—"}
                        </td>
                        <td>
                          <span className={`status-badge status-${reqItem.status?.replace(/_/g, "-")}`}>
                            {formatRequestStatus(reqItem.status)}
                          </span>
                          {reqItem.testScheduledAt && (
                            <div style={{ fontSize: "0.72rem", color: "#9ca3af", marginTop: "0.25rem" }}>
                              📅 {new Date(reqItem.testScheduledAt).toLocaleDateString()}
                            </div>
                          )}
                        </td>
                        <td className="dash-actions">
                          {!isScheduled ? (
                            <button
                              className="dash-btn schedule"
                              disabled={!isVerified || busyId === reqItem.requestId}
                              onClick={() => setScheduleModal({ open: true, request: reqItem, date: "" })}
                            >
                              📅 Schedule Test
                            </button>
                          ) : (
                            <>
                              <button
                                className="dash-btn approve"
                                disabled={!isVerified || busyId === reqItem.requestId}
                                onClick={() => handleVerifyBloodTest(reqItem)}
                                title="Blood test passed — complete donation"
                              >
                                ✅ Verify (Pass)
                              </button>
                              <button
                                className="dash-btn reject"
                                disabled={!isVerified || busyId === reqItem.requestId}
                                onClick={() => setRejectModal({ open: true, request: reqItem, reason: "" })}
                                title="Blood test failed — promote backup donor"
                              >
                                ❌ Reject (Fail)
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {/* Schedule Blood Test Modal */}
      {scheduleModal.open && (
        <div className="dash-modal-backdrop" onClick={() => setScheduleModal({ open: false, request: null, date: "" })}>
          <div className="dash-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dash-modal-header">
              <h3 className="dash-modal-title">Schedule Blood Test</h3>
              <button className="dash-modal-close" onClick={() => setScheduleModal({ open: false, request: null, date: "" })}>
                &times;
              </button>
            </div>
            <form onSubmit={handleScheduleSubmit}>
              <div className="dash-modal-body">
                <p style={{ color: "#cbd5e1", fontSize: "0.9rem" }}>
                  Schedule blood testing for donor <strong>{scheduleModal.request?.confirmedDonor?.fullName}</strong>.
                  A notification will be sent to the donor with instructions to report to your hospital.
                </p>
                <div>
                  <label className="dash-field-label">Scheduled Date & Time Description</label>
                  <input
                    type="text"
                    className="dash-field-input"
                    placeholder="e.g. Tomorrow at 10:30 AM, Room 204"
                    value={scheduleModal.date}
                    onChange={(e) => setScheduleModal((prev) => ({ ...prev, date: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div className="dash-modal-footer">
                <button
                  type="button"
                  className="dash-btn secondary"
                  onClick={() => setScheduleModal({ open: false, request: null, date: "" })}
                >
                  Cancel
                </button>
                <button type="submit" className="dash-btn schedule" disabled={busyId === scheduleModal.request?.requestId}>
                  {busyId === scheduleModal.request?.requestId ? "Scheduling..." : "Confirm Schedule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Blood Test & Promote Backup Modal */}
      {rejectModal.open && (
        <div className="dash-modal-backdrop" onClick={() => setRejectModal({ open: false, request: null, reason: "" })}>
          <div className="dash-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dash-modal-header">
              <h3 className="dash-modal-title" style={{ color: "#ef4444" }}>Reject Blood Test</h3>
              <button className="dash-modal-close" onClick={() => setRejectModal({ open: false, request: null, reason: "" })}>
                &times;
              </button>
            </div>
            <form onSubmit={handleRejectSubmit}>
              <div className="dash-modal-body">
                <p style={{ color: "#cbd5e1", fontSize: "0.9rem" }}>
                  Mark blood test for donor <strong>{rejectModal.request?.confirmedDonor?.fullName}</strong> as rejected.
                  The system will <strong>automatically promote the nearest backup donor</strong> on standby.
                </p>
                <div>
                  <label className="dash-field-label">Rejection Reason</label>
                  <input
                    type="text"
                    className="dash-field-input"
                    placeholder="e.g. Low hemoglobin, elevated liver enzymes, etc."
                    value={rejectModal.reason}
                    onChange={(e) => setRejectModal((prev) => ({ ...prev, reason: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div className="dash-modal-footer">
                <button
                  type="button"
                  className="dash-btn secondary"
                  onClick={() => setRejectModal({ open: false, request: null, reason: "" })}
                >
                  Cancel
                </button>
                <button type="submit" className="dash-btn reject" disabled={busyId === rejectModal.request?.requestId}>
                  {busyId === rejectModal.request?.requestId ? "Processing..." : "Confirm Rejection & Promote Backup"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
