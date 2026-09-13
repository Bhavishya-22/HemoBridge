import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { formatRequestStatus } from "../../utils/roleAccess";
import "../styles/dashboard.css";
import { API_BASE } from "../../config/api";

// --- Custom Healthcare SVG Icons ---
function BloodDropIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="#ef4444">
      <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
    </svg>
  );
}

function OverviewIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function ClipboardCheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <polyline points="9 14 11 16 15 11" />
    </svg>
  );
}

function FlaskLabIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2v7.31L4.2 18.06A2 2 0 0 0 5.86 21h12.28a2 2 0 0 0 1.66-2.94L14 9.31V2" />
      <line x1="8.5" y1="2" x2="15.5" y2="2" />
      <line x1="6" y1="16" x2="18" y2="16" />
    </svg>
  );
}

function HospitalCrossIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18" />
      <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
      <path d="M12 7v8" />
      <path d="M8 11h8" />
    </svg>
  );
}

function ShieldSecurityIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

export default function HospitalDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Core Data
  const [pendingRequests, setPendingRequests] = useState([]);
  const [testingRequests, setTestingRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingTesting, setLoadingTesting] = useState(true);
  const [actionMsg, setActionMsg] = useState("");
  const [busyId, setBusyId] = useState(null);

  // Tab State: "overview" | "pending" | "testing"
  const [activeTab, setActiveTab] = useState("overview");

  // Filtering & Search
  const [pendingSearch, setPendingSearch] = useState("");
  const [pendingEmergencyFilter, setPendingEmergencyFilter] = useState("all");
  const [testingSearch, setTestingSearch] = useState("");
  const [testingStatusFilter, setTestingStatusFilter] = useState("all"); // "all" | "matched" | "blood_test_scheduled"

  // Modals
  const [scheduleModal, setScheduleModal] = useState({ open: false, request: null, date: "" });
  const [rejectModal, setRejectModal] = useState({ open: false, request: null, reason: "" });
  const [requestDetailModal, setRequestDetailModal] = useState(null); // Request to inspect
  const [testingDetailModal, setTestingDetailModal] = useState(null); // Match/Test to inspect
  const [facilityStatusModal, setFacilityStatusModal] = useState(false); // Facility accreditation info

  useEffect(() => {
    if (user && user.role !== "hospital") {
      navigate("/home", { replace: true });
    }
  }, [user, navigate]);

  const fetchPending = async () => {
    try {
      setLoading(true);
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
      setLoadingTesting(true);
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

    setBusyId(requestId);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "reject" ? { rejectionReason: "Rejected by hospital medical staff" } : {}
        ),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMsg(`Blood request ${action === "approve" ? "approved for donor broadcast" : "rejected"} successfully.`);
        setPendingRequests((prev) => prev.filter((r) => r._id !== requestId));
        if (requestDetailModal && requestDetailModal._id === requestId) {
          setRequestDetailModal(null);
        }
        await fetchTesting();
      } else {
        setActionMsg(data.message || "Action failed.");
      }
    } catch {
      setActionMsg("Server error. Please try again.");
    } finally {
      setBusyId(null);
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
          body: JSON.stringify({ testScheduleDate: scheduleModal.date || "Scheduled at hospital laboratory" }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        setActionMsg("Blood test scheduled! Notifications and instructions sent to donor.");
        setScheduleModal({ open: false, request: null, date: "" });
        if (testingDetailModal && testingDetailModal.requestId === scheduleModal.request.requestId) {
          setTestingDetailModal(null);
        }
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
        body: JSON.stringify({ isVerified: true, verificationNotes: "Clinical laboratory cross-matching verified successfully" }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMsg("Blood test verified! Blood request completed and units ready for clinical release.");
        setTestingRequests((prev) =>
          prev.filter((r) => r.requestId !== reqItem.requestId)
        );
        if (testingDetailModal && testingDetailModal.requestId === reqItem.requestId) {
          setTestingDetailModal(null);
        }
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
          verificationNotes: rejectModal.reason || "Blood sample failed hospital laboratory screening",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMsg(
          data.message || "Blood test marked as failed. Next backup donor auto-promoted!"
        );
        setTestingRequests((prev) =>
          prev.filter((r) => r.requestId !== rejectModal.request.requestId)
        );
        setRejectModal({ open: false, request: null, reason: "" });
        if (testingDetailModal && testingDetailModal.requestId === rejectModal.request.requestId) {
          setTestingDetailModal(null);
        }
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

  // Filtered Pending Requests
  const filteredPending = useMemo(() => {
    return pendingRequests.filter((r) => {
      if (pendingEmergencyFilter !== "all" && r.emergencyLevel !== pendingEmergencyFilter) {
        return false;
      }
      if (pendingSearch.trim()) {
        const q = pendingSearch.toLowerCase().trim();
        const bg = (r.bloodGroup || "").toLowerCase();
        const reqBy = (r.requestedBy?.fullName || "").toLowerCase();
        const city = (r.location?.city || "").toLowerCase();
        const id = (r._id || "").toLowerCase();
        if (!bg.includes(q) && !reqBy.includes(q) && !city.includes(q) && !id.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [pendingRequests, pendingEmergencyFilter, pendingSearch]);

  // Filtered Testing Requests
  const filteredTesting = useMemo(() => {
    return testingRequests.filter((r) => {
      if (testingStatusFilter === "matched" && r.status !== "matched") return false;
      if (testingStatusFilter === "blood_test_scheduled" && r.status !== "blood_test_scheduled") return false;

      if (testingSearch.trim()) {
        const q = testingSearch.toLowerCase().trim();
        const bg = (r.bloodGroup || "").toLowerCase();
        const donorName = (r.confirmedDonor?.fullName || "").toLowerCase();
        const receiverName = (r.receiver?.fullName || "").toLowerCase();
        const id = (r.requestId || "").toLowerCase();
        if (!bg.includes(q) && !donorName.includes(q) && !receiverName.includes(q) && !id.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [testingRequests, testingStatusFilter, testingSearch]);

  return (
    <div className="dash-page">
      {/* ======= Left Sidebar ======= */}
      <aside className="dash-sidebar">
        <div className="dash-brand">
          <span className="dash-brand-icon">
            <BloodDropIcon />
          </span>
          <span className="dash-brand-name">
            Blood<span>Bank</span>
          </span>
        </div>

        <nav className="dash-nav">
          <span className="dash-nav-label">Clinical Facility Panel</span>

          {/* Tab 1: Overview */}
          <button
            type="button"
            className={`dash-nav-item ${activeTab === "overview" ? "active" : ""}`}
            onClick={() => setActiveTab("overview")}
            id="nav-hospital-overview"
          >
            <OverviewIcon />
            <span>Overview</span>
          </button>

          {/* Tab 2: Pending Approvals */}
          <button
            type="button"
            className={`dash-nav-item ${activeTab === "pending" ? "active" : ""}`}
            onClick={() => setActiveTab("pending")}
            id="nav-hospital-pending"
          >
            <ClipboardCheckIcon />
            <span>Pending Approvals</span>
            {pendingRequests.length > 0 && (
              <span className="dash-nav-badge">{pendingRequests.length}</span>
            )}
          </button>

          {/* Tab 3: Blood Test & Matching */}
          <button
            type="button"
            className={`dash-nav-item ${activeTab === "testing" ? "active" : ""}`}
            onClick={() => setActiveTab("testing")}
            id="nav-hospital-testing"
          >
            <FlaskLabIcon />
            <span>Blood Test & Matching</span>
            {testingRequests.length > 0 && (
              <span className="dash-nav-badge">{testingRequests.length}</span>
            )}
          </button>
        </nav>

        {/* Hospital Facility Profile Block */}
        <div className="dash-user-block">
          <div className="dash-avatar-hospital" title="Verified Hospital Center">
            <HospitalCrossIcon size={20} />
            <span className="dash-avatar-status-dot" title={isVerified ? "Facility Verified" : "Verification Pending"} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p className="dash-user-name" title={user.hospitalName || user.fullName}>
              {user.hospitalName || user.fullName || "Hospital Center"}
            </p>
            <p className="dash-user-role">Medical Facility</p>
          </div>
          <button className="dash-logout-btn" onClick={handleLogout} title="Logout">
            Logout
          </button>
        </div>
      </aside>

      {/* ======= Main Content Area ======= */}
      <main className="dash-main">
        <header className="dash-topbar">
          <div>
            <h1 className="dash-page-title">
              {activeTab === "overview" && "Hospital Operations Center"}
              {activeTab === "pending" && "Blood Requests Awaiting Verification"}
              {activeTab === "testing" && "Matched Donors & Blood Testing"}
            </h1>
            <p className="dash-page-sub">
              {activeTab === "overview" && "Authorize patient requests, monitor donor match queues, and certify laboratory cross-matching."}
              {activeTab === "pending" && "Review incoming clinical requests and authorize automated donor broadcast sweeps."}
              {activeTab === "testing" && "Schedule donor clinical appointments and certify blood cross-matching samples."}
            </p>
          </div>
          <div
            className={`dash-topbar-badge ${isVerified ? "verified-badge" : "pending-badge"}`}
            style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
            onClick={() => setFacilityStatusModal(true)}
            title="Click to view facility accreditation status"
          >
            <HospitalCrossIcon size={14} />
            <span>{isVerified ? "Verified Facility" : "Verification Pending"}</span>
          </div>
        </header>

        {!isVerified && (
          <div className="dash-alert warning">
            Your hospital facility account is awaiting administrator accreditation. You can inspect requests, but clinical authorization actions require full verification.
          </div>
        )}

        {actionMsg && <div className="dash-toast">{actionMsg}</div>}

        {/* ======= Center Interactive Stat Cards (Always visible & interactive) ======= */}
        <section className="dash-stats-grid">
          {/* Stat 1: Pending Initial Approvals */}
          <div
            className={`dash-stat-card clickable ${activeTab === "pending" ? "active-card" : ""}`}
            onClick={() => setActiveTab("pending")}
            title="Click to view requests awaiting hospital authorization"
            id="stat-card-pending-approvals"
          >
            <span className="dash-stat-icon" style={{ color: "#ef4444" }}>
              <ClipboardCheckIcon />
            </span>
            <div>
              <p className="dash-stat-label">Pending Initial Approvals</p>
              <p className="dash-stat-value">{pendingRequests.length}</p>
              <p className="dash-stat-hint">Click to inspect queue →</p>
            </div>
          </div>

          {/* Stat 2: Testing & Matched Donors */}
          <div
            className={`dash-stat-card clickable ${activeTab === "testing" ? "active-card" : ""}`}
            onClick={() => setActiveTab("testing")}
            title="Click to view matched donors and blood tests"
            id="stat-card-testing-donors"
          >
            <span className="dash-stat-icon" style={{ color: "#3b82f6" }}>
              <FlaskLabIcon />
            </span>
            <div>
              <p className="dash-stat-label">Testing & Matched Donors</p>
              <p className="dash-stat-value">{testingRequests.length}</p>
              <p className="dash-stat-hint">Click to inspect tests →</p>
            </div>
          </div>

          {/* Stat 3: Hospital Facility Status */}
          <div
            className="dash-stat-card clickable"
            onClick={() => setFacilityStatusModal(true)}
            title="Click to view facility license and clinical permissions"
            id="stat-card-hospital-status"
          >
            <span className="dash-stat-icon" style={{ color: isVerified ? "#10b981" : "#f59e0b" }}>
              <HospitalCrossIcon size={26} />
            </span>
            <div>
              <p className="dash-stat-label">Hospital Status</p>
              <p className="dash-stat-value" style={{ fontSize: "1.1rem" }}>
                {isVerified ? "Verified Partner" : "Pending Audit"}
              </p>
              <p className="dash-stat-hint">Click for credentials →</p>
            </div>
          </div>
        </section>

        {/* ========================================================
            VIEW 1: OVERVIEW TAB
            Shows quick summaries of both queues with shortcuts
           ======================================================== */}
        {activeTab === "overview" && (
          <>
            {/* Section: Pending Approvals Quick Glance */}
            <section className="dash-section">
              <div className="dash-section-header">
                <h2 className="dash-section-title" style={{ margin: 0 }}>
                  Blood Requests Awaiting Verification
                </h2>
                <button
                  type="button"
                  className="dash-link-btn"
                  onClick={() => setActiveTab("pending")}
                >
                  View All ({pendingRequests.length}) →
                </button>
              </div>

              {loading ? (
                <div className="dash-loading">
                  <span className="dash-spinner" />
                </div>
              ) : pendingRequests.length === 0 ? (
                <div className="dash-empty">
                  No requests awaiting hospital verification at this time.
                </div>
              ) : (
                <div className="dash-table-wrap">
                  <table className="dash-table">
                    <thead>
                      <tr>
                        <th>Blood Group</th>
                        <th>Quantity</th>
                        <th>Emergency</th>
                        <th>Requester</th>
                        <th>Created</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingRequests.slice(0, 4).map((r) => (
                        <tr
                          key={r._id}
                          className="clickable-row"
                          onClick={() => setRequestDetailModal(r)}
                          title="Click to view clinical request summary"
                        >
                          <td>
                            <span className="blood-badge">{r.bloodGroup}</span>
                          </td>
                          <td>
                            {r.quantity} unit{r.quantity > 1 ? "s" : ""}
                          </td>
                          <td>
                            <span className={`emergency-badge ${r.emergencyLevel}`}>
                              {r.emergencyLevel}
                            </span>
                          </td>
                          <td>
                            <strong style={{ color: "#f3f4f6" }}>{r.requestedBy?.fullName || "Patient"}</strong>
                          </td>
                          <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                          <td className="dash-actions" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="dash-view-btn"
                              onClick={() => setRequestDetailModal(r)}
                            >
                              <EyeIcon /> Details
                            </button>
                            <button
                              className="dash-btn approve"
                              onClick={() => handleVerify(r._id, "approve")}
                              disabled={!isVerified || busyId === r._id}
                            >
                              Approve
                            </button>
                            <button
                              className="dash-btn reject"
                              onClick={() => handleVerify(r._id, "reject")}
                              disabled={!isVerified || busyId === r._id}
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

            {/* Section: Matched Donors & Blood Testing Quick Glance */}
            <section className="dash-section">
              <div className="dash-section-header">
                <h2 className="dash-section-title" style={{ margin: 0 }}>
                  Matched Donors & Blood Testing Pipeline
                </h2>
                <button
                  type="button"
                  className="dash-link-btn"
                  onClick={() => setActiveTab("testing")}
                >
                  View All ({testingRequests.length}) →
                </button>
              </div>

              {loadingTesting ? (
                <div className="dash-loading">
                  <span className="dash-spinner" />
                </div>
              ) : testingRequests.length === 0 ? (
                <div className="dash-empty">
                  No matched donors or testing verifications pending.
                </div>
              ) : (
                <div className="dash-table-wrap">
                  <table className="dash-table">
                    <thead>
                      <tr>
                        <th>Blood / Units</th>
                        <th>Confirmed Donor</th>
                        <th>Health Screening</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {testingRequests.slice(0, 4).map((reqItem) => {
                        const donor = reqItem.confirmedDonor;
                        const isScheduled = reqItem.status === "blood_test_scheduled";
                        const isHealthy = !donor?.diseases?.length;

                        return (
                          <tr
                            key={reqItem.requestId}
                            className="clickable-row"
                            onClick={() => setTestingDetailModal(reqItem)}
                            title="Click to view donor screening & test details"
                          >
                            <td>
                              <span className="blood-badge">{reqItem.bloodGroup}</span>
                              <span style={{ marginLeft: "0.5rem", fontSize: "0.85rem", color: "#cbd5e1" }}>
                                {reqItem.quantity} unit{reqItem.quantity > 1 ? "s" : ""}
                              </span>
                            </td>
                            <td>
                              <strong style={{ color: "#f87171" }}>{donor?.fullName || "Donor Matched"}</strong>
                              <span className="blood-badge" style={{ marginLeft: "0.4rem", fontSize: "0.72rem", padding: "0.1rem 0.4rem" }}>
                                {donor?.bloodGroup || reqItem.bloodGroup}
                              </span>
                            </td>
                            <td>
                              <span className={`donor-health-pill ${isHealthy ? "healthy" : "flagged"}`}>
                                {isHealthy ? "✓ Cleared" : "⚠ Conditions"}
                              </span>
                            </td>
                            <td>
                              <span className={`status-badge status-${reqItem.status?.replace(/_/g, "-")}`}>
                                {formatRequestStatus(reqItem.status)}
                              </span>
                            </td>
                            <td className="dash-actions" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                className="dash-view-btn"
                                onClick={() => setTestingDetailModal(reqItem)}
                              >
                                <EyeIcon /> Match
                              </button>
                              {!isScheduled ? (
                                <button
                                  className="dash-btn schedule"
                                  disabled={!isVerified || busyId === reqItem.requestId}
                                  onClick={() => setScheduleModal({ open: true, request: reqItem, date: "" })}
                                >
                                  <CalendarIcon /> Schedule
                                </button>
                              ) : (
                                <>
                                  <button
                                    className="dash-btn approve"
                                    disabled={!isVerified || busyId === reqItem.requestId}
                                    onClick={() => handleVerifyBloodTest(reqItem)}
                                    title="Blood test passed — complete donation"
                                  >
                                    Verify
                                  </button>
                                  <button
                                    className="dash-btn reject"
                                    disabled={!isVerified || busyId === reqItem.requestId}
                                    onClick={() => setRejectModal({ open: true, request: reqItem, reason: "" })}
                                    title="Blood test failed — promote backup donor"
                                  >
                                    Fail
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
          </>
        )}

        {/* ========================================================
            VIEW 2: PENDING APPROVALS TAB
           ======================================================== */}
        {activeTab === "pending" && (
          <section className="dash-section">
            {/* Filter Pills and Search */}
            <div className="dash-toolbar">
              <div className="dash-filters">
                <button
                  type="button"
                  className={`dash-filter-pill ${pendingEmergencyFilter === "all" ? "active" : ""}`}
                  onClick={() => setPendingEmergencyFilter("all")}
                >
                  All Priorities ({pendingRequests.length})
                </button>
                <button
                  type="button"
                  className={`dash-filter-pill ${pendingEmergencyFilter === "critical" ? "active" : ""}`}
                  onClick={() => setPendingEmergencyFilter("critical")}
                >
                  Critical ({pendingRequests.filter((r) => r.emergencyLevel === "critical").length})
                </button>
                <button
                  type="button"
                  className={`dash-filter-pill ${pendingEmergencyFilter === "high" ? "active" : ""}`}
                  onClick={() => setPendingEmergencyFilter("high")}
                >
                  High ({pendingRequests.filter((r) => r.emergencyLevel === "high").length})
                </button>
                <button
                  type="button"
                  className={`dash-filter-pill ${pendingEmergencyFilter === "medium" ? "active" : ""}`}
                  onClick={() => setPendingEmergencyFilter("medium")}
                >
                  Medium ({pendingRequests.filter((r) => r.emergencyLevel === "medium").length})
                </button>
                <button
                  type="button"
                  className={`dash-filter-pill ${pendingEmergencyFilter === "low" ? "active" : ""}`}
                  onClick={() => setPendingEmergencyFilter("low")}
                >
                  Low ({pendingRequests.filter((r) => r.emergencyLevel === "low").length})
                </button>
              </div>

              <div className="dash-search-box">
                <span className="dash-search-icon">
                  <SearchIcon />
                </span>
                <input
                  type="text"
                  className="dash-search-input"
                  placeholder="Search blood group, patient, city..."
                  value={pendingSearch}
                  onChange={(e) => setPendingSearch(e.target.value)}
                />
              </div>
            </div>

            {loading ? (
              <div className="dash-loading">
                <span className="dash-spinner" />
              </div>
            ) : filteredPending.length === 0 ? (
              <div className="dash-empty">
                No blood requests found matching your filter criteria.
              </div>
            ) : (
              <div className="dash-table-wrap">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Blood Group</th>
                      <th>Quantity</th>
                      <th>Emergency Level</th>
                      <th>Requester</th>
                      <th>Location</th>
                      <th>Logged Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPending.map((r) => (
                      <tr
                        key={r._id}
                        className="clickable-row"
                        onClick={() => setRequestDetailModal(r)}
                        title="Click to view medical request summary"
                      >
                        <td>
                          <span className="blood-badge">{r.bloodGroup}</span>
                        </td>
                        <td>
                          {r.quantity} unit{r.quantity > 1 ? "s" : ""}
                        </td>
                        <td>
                          <span className={`emergency-badge ${r.emergencyLevel}`}>
                            {r.emergencyLevel}
                          </span>
                        </td>
                        <td>
                          <strong style={{ color: "#f3f4f6" }}>
                            {r.requestedBy?.fullName || "Patient"}
                          </strong>
                        </td>
                        <td>
                          {r.location?.city ? `${r.location.city}${r.location.state ? `, ${r.location.state}` : ""}` : "Registered City"}
                        </td>
                        <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                        <td className="dash-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="dash-view-btn"
                            onClick={() => setRequestDetailModal(r)}
                          >
                            <EyeIcon /> Details
                          </button>
                          <button
                            className="dash-btn approve"
                            onClick={() => handleVerify(r._id, "approve")}
                            disabled={!isVerified || busyId === r._id}
                          >
                            Approve
                          </button>
                          <button
                            className="dash-btn reject"
                            onClick={() => handleVerify(r._id, "reject")}
                            disabled={!isVerified || busyId === r._id}
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
        )}

        {/* ========================================================
            VIEW 3: BLOOD TEST & MATCHING TAB
           ======================================================== */}
        {activeTab === "testing" && (
          <section className="dash-section">
            <div className="dash-toolbar">
              <div className="dash-filters">
                <button
                  type="button"
                  className={`dash-filter-pill ${testingStatusFilter === "all" ? "active" : ""}`}
                  onClick={() => setTestingStatusFilter("all")}
                >
                  All Matches ({testingRequests.length})
                </button>
                <button
                  type="button"
                  className={`dash-filter-pill ${testingStatusFilter === "matched" ? "active" : ""}`}
                  onClick={() => setTestingStatusFilter("matched")}
                >
                  Awaiting Test Scheduling ({testingRequests.filter((r) => r.status === "matched").length})
                </button>
                <button
                  type="button"
                  className={`dash-filter-pill ${testingStatusFilter === "blood_test_scheduled" ? "active" : ""}`}
                  onClick={() => setTestingStatusFilter("blood_test_scheduled")}
                >
                  Scheduled / In Lab ({testingRequests.filter((r) => r.status === "blood_test_scheduled").length})
                </button>
              </div>

              <div className="dash-search-box">
                <span className="dash-search-icon">
                  <SearchIcon />
                </span>
                <input
                  type="text"
                  className="dash-search-input"
                  placeholder="Search donor name, blood group, patient..."
                  value={testingSearch}
                  onChange={(e) => setTestingSearch(e.target.value)}
                />
              </div>
            </div>

            {loadingTesting ? (
              <div className="dash-loading">
                <span className="dash-spinner" />
              </div>
            ) : filteredTesting.length === 0 ? (
              <div className="dash-empty">
                No matched requests or tests found matching your criteria.
              </div>
            ) : (
              <div className="dash-table-wrap">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Blood / Quantity</th>
                      <th>Patient</th>
                      <th>Confirmed Donor</th>
                      <th>Health Screening Metrics</th>
                      <th>Pipeline Status</th>
                      <th>Clinical Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTesting.map((reqItem) => {
                      const donor = reqItem.confirmedDonor;
                      const receiver = reqItem.receiver;
                      const isScheduled = reqItem.status === "blood_test_scheduled";
                      const isHealthy = !donor?.diseases?.length;

                      return (
                        <tr
                          key={reqItem.requestId}
                          className="clickable-row"
                          onClick={() => setTestingDetailModal(reqItem)}
                          title="Click to view donor screening & test details"
                        >
                          <td>
                            <span className="blood-badge">{reqItem.bloodGroup}</span>
                            <span style={{ marginLeft: "0.5rem", fontSize: "0.85rem", color: "#cbd5e1" }}>
                              {reqItem.quantity} unit{reqItem.quantity > 1 ? "s" : ""}
                            </span>
                            <div style={{ marginTop: "0.3rem" }}>
                              <span className={`emergency-badge ${reqItem.emergencyLevel}`}>
                                {reqItem.emergencyLevel}
                              </span>
                            </div>
                          </td>
                          <td>
                            <strong style={{ color: "#f1f5f9" }}>{receiver?.fullName || "Patient"}</strong>
                          </td>
                          <td>
                            {donor ? (
                              <>
                                <strong style={{ color: "#f87171" }}>{donor.fullName}</strong>
                                <span className="blood-badge" style={{ marginLeft: "0.4rem", fontSize: "0.7rem", padding: "0.1rem 0.4rem" }}>
                                  {donor.bloodGroup}
                                </span>
                              </>
                            ) : (
                              <span style={{ color: "#9ca3af" }}>No donor confirmed</span>
                            )}
                          </td>
                          <td>
                            {donor ? (
                              <div style={{ fontSize: "0.8rem", color: "#cbd5e1", lineHeight: 1.4 }}>
                                <div>Weight: <strong>{donor.weight ? `${donor.weight} kg` : "—"}</strong> · Height: <strong>{donor.height ? `${donor.height} cm` : "—"}</strong></div>
                                <div style={{ marginTop: "0.2rem" }}>
                                  <span className={`donor-health-pill ${isHealthy ? "healthy" : "flagged"}`}>
                                    {isHealthy ? "✓ Clean Screening" : `⚠ ${donor.diseases.join(", ")}`}
                                  </span>
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
                          <td className="dash-actions" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="dash-view-btn"
                              onClick={() => setTestingDetailModal(reqItem)}
                            >
                              <EyeIcon /> Match
                            </button>
                            {!isScheduled ? (
                              <button
                                className="dash-btn schedule"
                                disabled={!isVerified || busyId === reqItem.requestId}
                                onClick={() => setScheduleModal({ open: true, request: reqItem, date: "" })}
                              >
                                <CalendarIcon /> Schedule Test
                              </button>
                            ) : (
                              <>
                                <button
                                  className="dash-btn approve"
                                  disabled={!isVerified || busyId === reqItem.requestId}
                                  onClick={() => handleVerifyBloodTest(reqItem)}
                                  title="Blood test passed — complete donation"
                                >
                                  Verify (Pass)
                                </button>
                                <button
                                  className="dash-btn reject"
                                  disabled={!isVerified || busyId === reqItem.requestId}
                                  onClick={() => setRejectModal({ open: true, request: reqItem, reason: "" })}
                                  title="Blood test failed — promote backup donor"
                                >
                                  Reject (Fail)
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
        )}
      </main>

      {/* ========================================================
          MODAL 1: REQUEST MEDICAL SUMMARY (PATIENT PRIVACY)
         ======================================================== */}
      {requestDetailModal && (
        <div className="dash-modal-backdrop" onClick={() => setRequestDetailModal(null)}>
          <div className="dash-modal dash-modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="dash-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                <h3 className="dash-modal-title">Clinical Request #{requestDetailModal._id.slice(-6).toUpperCase()}</h3>
                <span className="blood-badge">{requestDetailModal.bloodGroup}</span>
                <span className={`emergency-badge ${requestDetailModal.emergencyLevel}`}>
                  {requestDetailModal.emergencyLevel}
                </span>
                <span style={{ fontSize: "0.8rem", color: "#9ca3af" }}>
                  {requestDetailModal.quantity} Unit{requestDetailModal.quantity > 1 ? "s" : ""}
                </span>
              </div>
              <button
                type="button"
                className="dash-modal-close"
                onClick={() => setRequestDetailModal(null)}
                title="Close"
              >
                &times;
              </button>
            </div>

            <div className="dash-modal-body">
              {/* Privacy Shield Banner */}
              <div className="privacy-badge-container">
                <span className="privacy-badge-icon">
                  <ShieldSecurityIcon size={18} />
                </span>
                <div>
                  <div className="privacy-badge-title">Medical Request Confidentiality — Privacy Active</div>
                  <p className="privacy-badge-desc">
                    Patient personal contact channels are safeguarded under clinical healthcare confidentiality rules. Medical evaluation and authorization proceed through hospital workflow.
                  </p>
                </div>
              </div>

              {/* Detail Grid */}
              <div className="detail-grid">
                <div className="detail-item">
                  <div className="detail-item-label">Patient / Requester</div>
                  <div className="detail-item-val">
                    {requestDetailModal.requestedBy?.fullName || "Verified Patient"}
                  </div>
                </div>

                <div className="detail-item">
                  <div className="detail-item-label">Blood Group & Units Required</div>
                  <div className="detail-item-val">
                    <span className="blood-badge">{requestDetailModal.bloodGroup}</span>
                    <span>{requestDetailModal.quantity} Unit{requestDetailModal.quantity > 1 ? "s" : ""}</span>
                  </div>
                </div>

                <div className="detail-item">
                  <div className="detail-item-label">Clinical Emergency Level</div>
                  <div className="detail-item-val">
                    <span className={`emergency-badge ${requestDetailModal.emergencyLevel}`}>
                      {requestDetailModal.emergencyLevel?.toUpperCase()}
                    </span>
                  </div>
                </div>

                <div className="detail-item">
                  <div className="detail-item-label">Location / City</div>
                  <div className="detail-item-val">
                    {requestDetailModal.location?.city
                      ? `${requestDetailModal.location.city}${requestDetailModal.location.state ? `, ${requestDetailModal.location.state}` : ""}`
                      : "Registered City"}
                  </div>
                </div>

                <div className="detail-item">
                  <div className="detail-item-label">Submitted On</div>
                  <div className="detail-item-val" style={{ fontSize: "0.82rem" }}>
                    {new Date(requestDetailModal.createdAt).toLocaleString()}
                  </div>
                </div>

                <div className="detail-item">
                  <div className="detail-item-label">Hospital Approval Status</div>
                  <div className="detail-item-val">
                    <span className="status-badge status-pending-hospital-approval">
                      Awaiting Hospital Review
                    </span>
                  </div>
                </div>
              </div>

              {/* Medical Description / Notes */}
              <div>
                <label className="dash-field-label">Patient Medical Notes / Clinical Description</label>
                <div className="clinical-notes-box">
                  {requestDetailModal.description || "No specific clinical notes attached. Standard emergency request logged."}
                </div>
              </div>
            </div>

            <div className="dash-modal-footer">
              <button
                type="button"
                className="dash-btn secondary"
                onClick={() => setRequestDetailModal(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="dash-btn reject"
                onClick={() => handleVerify(requestDetailModal._id, "reject")}
                disabled={!isVerified || busyId === requestDetailModal._id}
              >
                Reject Request
              </button>
              <button
                type="button"
                className="dash-btn approve"
                onClick={() => handleVerify(requestDetailModal._id, "approve")}
                disabled={!isVerified || busyId === requestDetailModal._id}
              >
                Approve & Broadcast to Donors
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 2: CLINICAL MATCH & DONOR SCREENING
         ======================================================== */}
      {testingDetailModal && (
        <div className="dash-modal-backdrop" onClick={() => setTestingDetailModal(null)}>
          <div className="dash-modal dash-modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="dash-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                <h3 className="dash-modal-title">Clinical Match Details</h3>
                <span className="blood-badge">{testingDetailModal.bloodGroup}</span>
                <span className={`emergency-badge ${testingDetailModal.emergencyLevel}`}>
                  {testingDetailModal.emergencyLevel}
                </span>
                <span style={{ fontSize: "0.8rem", color: "#9ca3af" }}>
                  {testingDetailModal.quantity} Unit{testingDetailModal.quantity > 1 ? "s" : ""}
                </span>
              </div>
              <button
                type="button"
                className="dash-modal-close"
                onClick={() => setTestingDetailModal(null)}
                title="Close"
              >
                &times;
              </button>
            </div>

            <div className="dash-modal-body">
              {/* Privacy Shield Banner */}
              <div className="privacy-badge-container">
                <span className="privacy-badge-icon">
                  <ShieldSecurityIcon size={18} />
                </span>
                <div>
                  <div className="privacy-badge-title">Clinical Screening Privacy Protected</div>
                  <p className="privacy-badge-desc">
                    Donor health parameters are screened for clinical cross-matching viability. Direct contact is facilitated through hospital administrative channels.
                  </p>
                </div>
              </div>

              {/* Detail Grid */}
              <div className="detail-grid">
                <div className="detail-item">
                  <div className="detail-item-label">Matched Donor</div>
                  <div className="detail-item-val">
                    {testingDetailModal.confirmedDonor?.fullName ? (
                      <>
                        <strong style={{ color: "#f87171" }}>{testingDetailModal.confirmedDonor.fullName}</strong>
                        <span className="blood-badge" style={{ fontSize: "0.7rem", padding: "0.1rem 0.4rem" }}>
                          {testingDetailModal.confirmedDonor.bloodGroup}
                        </span>
                      </>
                    ) : "Awaiting Acceptance"}
                  </div>
                </div>

                <div className="detail-item">
                  <div className="detail-item-label">Patient / Recipient</div>
                  <div className="detail-item-val">
                    {testingDetailModal.receiver?.fullName || "Patient"}
                  </div>
                </div>

                <div className="detail-item">
                  <div className="detail-item-label">Physical Screening Metrics</div>
                  <div className="detail-item-val">
                    Weight: <strong>{testingDetailModal.confirmedDonor?.weight ? `${testingDetailModal.confirmedDonor.weight} kg` : "N/A"}</strong>
                    {" · "}
                    Height: <strong>{testingDetailModal.confirmedDonor?.height ? `${testingDetailModal.confirmedDonor.height} cm` : "N/A"}</strong>
                  </div>
                </div>

                <div className="detail-item">
                  <div className="detail-item-label">Health & Medical History Status</div>
                  <div className="detail-item-val">
                    <span className={`donor-health-pill ${!testingDetailModal.confirmedDonor?.diseases?.length ? "healthy" : "flagged"}`}>
                      {!testingDetailModal.confirmedDonor?.diseases?.length ? "✓ Healthy / No conditions reported" : `⚠ ${testingDetailModal.confirmedDonor.diseases.join(", ")}`}
                    </span>
                  </div>
                </div>

                <div className="detail-item">
                  <div className="detail-item-label">Laboratory Pipeline Status</div>
                  <div className="detail-item-val">
                    <span className={`status-badge status-${testingDetailModal.status?.replace(/_/g, "-")}`}>
                      {formatRequestStatus(testingDetailModal.status)}
                    </span>
                  </div>
                </div>

                <div className="detail-item">
                  <div className="detail-item-label">Test Schedule Date</div>
                  <div className="detail-item-val" style={{ fontSize: "0.82rem" }}>
                    {testingDetailModal.testScheduledAt ? new Date(testingDetailModal.testScheduledAt).toLocaleString() : "Not Scheduled Yet"}
                  </div>
                </div>
              </div>
            </div>

            <div className="dash-modal-footer">
              <button
                type="button"
                className="dash-btn secondary"
                onClick={() => setTestingDetailModal(null)}
              >
                Close
              </button>

              {testingDetailModal.status !== "blood_test_scheduled" ? (
                <button
                  type="button"
                  className="dash-btn schedule"
                  disabled={!isVerified}
                  onClick={() => {
                    setScheduleModal({ open: true, request: testingDetailModal, date: "" });
                    setTestingDetailModal(null);
                  }}
                >
                  <CalendarIcon /> Schedule Test Appointment
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="dash-btn reject"
                    disabled={!isVerified}
                    onClick={() => {
                      setRejectModal({ open: true, request: testingDetailModal, reason: "" });
                      setTestingDetailModal(null);
                    }}
                  >
                    Fail & Promote Backup
                  </button>
                  <button
                    type="button"
                    className="dash-btn approve"
                    disabled={!isVerified}
                    onClick={() => handleVerifyBloodTest(testingDetailModal)}
                  >
                    Verify (Pass Blood Test)
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 3: HOSPITAL ACCREDITATION & PRIVILEGES STATUS
         ======================================================== */}
      {facilityStatusModal && (
        <div className="dash-modal-backdrop" onClick={() => setFacilityStatusModal(false)}>
          <div className="dash-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dash-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <HospitalCrossIcon size={20} />
                <h3 className="dash-modal-title">Facility Accreditation & Credentials</h3>
              </div>
              <button
                type="button"
                className="dash-modal-close"
                onClick={() => setFacilityStatusModal(false)}
                title="Close"
              >
                &times;
              </button>
            </div>

            <div className="dash-modal-body">
              {/* Facility Accreditation Badge */}
              <div className="privacy-badge-container" style={{ background: isVerified ? "rgba(16, 185, 129, 0.1)" : "rgba(245, 158, 11, 0.1)", borderColor: isVerified ? "rgba(16, 185, 129, 0.3)" : "rgba(245, 158, 11, 0.3)" }}>
                <span className="privacy-badge-icon" style={{ color: isVerified ? "#10b981" : "#f59e0b" }}>
                  <HospitalCrossIcon size={20} />
                </span>
                <div>
                  <div className="privacy-badge-title" style={{ color: isVerified ? "#10b981" : "#f59e0b" }}>
                    {isVerified ? "Verified Healthcare Clinical Partner" : "Accreditation Review in Progress"}
                  </div>
                  <p className="privacy-badge-desc">
                    {isVerified
                      ? "Facility authorized to approve blood requests, schedule donor testing, and certify laboratory cross-matching."
                      : "Account is awaiting administrator audit. Clinical operations are currently limited to queue viewing."}
                  </p>
                </div>
              </div>

              {/* Facility Details */}
              <div className="detail-grid" style={{ gridTemplateColumns: "1fr" }}>
                <div className="detail-item">
                  <div className="detail-item-label">Medical Center Name</div>
                  <div className="detail-item-val">
                    {user.hospitalName || user.fullName || "Hospital Center"}
                  </div>
                </div>

                <div className="detail-item">
                  <div className="detail-item-label">Clinical Registration / License No.</div>
                  <div className="detail-item-val">
                    {user.registrationNumber || "MED-REG-VERIFIED"}
                  </div>
                </div>

                <div className="detail-item">
                  <div className="detail-item-label">Authorized Facility Contact</div>
                  <div className="detail-item-val" style={{ fontSize: "0.85rem" }}>
                    {user.email} {user.hospitalPhone ? `· 📞 ${user.hospitalPhone}` : ""}
                  </div>
                </div>

                <div className="detail-item">
                  <div className="detail-item-label">Facility Privileges & Security Protocol</div>
                  <div style={{ fontSize: "0.82rem", color: "#9ca3af", lineHeight: 1.5, marginTop: "0.3rem" }}>
                    <div>✓ Blood Request Medical Necessity Authorization: <strong>{isVerified ? "Active" : "Locked"}</strong></div>
                    <div>✓ Laboratory Donor Cross-Matching Certification: <strong>{isVerified ? "Active" : "Locked"}</strong></div>
                    <div>✓ Standby Backup Donor Auto-Promotion: <strong>{isVerified ? "Active" : "Locked"}</strong></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="dash-modal-footer">
              <button
                type="button"
                className="dash-btn secondary"
                onClick={() => setFacilityStatusModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 4: SCHEDULE BLOOD TEST
         ======================================================== */}
      {scheduleModal.open && (
        <div className="dash-modal-backdrop" onClick={() => setScheduleModal({ open: false, request: null, date: "" })}>
          <div className="dash-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dash-modal-header">
              <h3 className="dash-modal-title">Schedule Clinical Blood Test</h3>
              <button className="dash-modal-close" onClick={() => setScheduleModal({ open: false, request: null, date: "" })}>
                &times;
              </button>
            </div>
            <form onSubmit={handleScheduleSubmit}>
              <div className="dash-modal-body">
                <p style={{ color: "#cbd5e1", fontSize: "0.9rem", lineHeight: 1.4 }}>
                  Schedule blood screening appointment for donor <strong>{scheduleModal.request?.confirmedDonor?.fullName}</strong>.
                  A high-priority notification will be sent with instructions to report to your clinical laboratory.
                </p>
                <div>
                  <label className="dash-field-label">Scheduled Date, Time & Laboratory Room</label>
                  <input
                    type="text"
                    className="dash-field-input"
                    placeholder="e.g. Tomorrow at 10:30 AM, Clinical Lab 204"
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

      {/* ========================================================
          MODAL 5: REJECT BLOOD TEST & PROMOTE BACKUP
         ======================================================== */}
      {rejectModal.open && (
        <div className="dash-modal-backdrop" onClick={() => setRejectModal({ open: false, request: null, reason: "" })}>
          <div className="dash-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dash-modal-header">
              <h3 className="dash-modal-title" style={{ color: "#ef4444" }}>Reject Blood Test (Promote Backup)</h3>
              <button className="dash-modal-close" onClick={() => setRejectModal({ open: false, request: null, reason: "" })}>
                &times;
              </button>
            </div>
            <form onSubmit={handleRejectSubmit}>
              <div className="dash-modal-body">
                <p style={{ color: "#cbd5e1", fontSize: "0.9rem", lineHeight: 1.4 }}>
                  Mark blood test for donor <strong>{rejectModal.request?.confirmedDonor?.fullName}</strong> as rejected.
                  The system will <strong>automatically promote the nearest backup donor</strong> on standby without delay.
                </p>
                <div>
                  <label className="dash-field-label">Clinical Rejection Reason</label>
                  <input
                    type="text"
                    className="dash-field-input"
                    placeholder="e.g. Low hemoglobin count, elevated AST/ALT, cross-match incompatibility"
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
                  {busyId === rejectModal.request?.requestId ? "Processing..." : "Confirm & Promote Backup Donor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

