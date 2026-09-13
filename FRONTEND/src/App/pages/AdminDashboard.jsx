import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import "../styles/dashboard.css";
import { API_BASE } from "../../config/api";

// --- SVG Icons ---
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

function HospitalIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18" />
      <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
      <path d="M9 21v-4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4" />
      <path d="M10 9h4" />
      <path d="M12 7v4" />
    </svg>
  );
}

function RequestIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function ShieldIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function ClockPendingIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
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

function LockSecurityIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

// --- Lifecycle Helper ---
function getLifecycleSituation(status, request) {
  switch (status) {
    case "pending_hospital_approval":
      return {
        summary: "Awaiting Hospital Verification",
        description: "Request has been logged by the patient. Currently awaiting verification and clinical authorization from the assigned hospital before broadcasting to eligible donors.",
        tag: "In Review",
      };
    case "hospital_approved":
      return {
        summary: "Approved by Hospital",
        description: "The hospital verified medical necessity. System is initiating broadcast sweeps to eligible matching donors within the search radius.",
        tag: "Broadcasting",
      };
    case "waiting_for_donor":
      return {
        summary: "Broadcast Active - Waiting for Donor",
        description: "Request is actively open to matched donors. The first eligible donor to accept will be instantly confirmed for donation.",
        tag: "Open Window",
      };
    case "matched":
      return {
        summary: "Donor Matched & Confirmed",
        description: request?.confirmedDonor?.fullName
          ? `Donor ${request.confirmedDonor.fullName} accepted this request. Hospital coordination and cross-matching preparation are underway.`
          : "An eligible donor accepted this request. Preparing clinical cross-matching schedule.",
        tag: "Matched",
      };
    case "blood_testing":
    case "blood_test_scheduled":
      return {
        summary: "Blood Testing in Progress",
        description: "Donor sample has been scheduled for laboratory screening and clinical compatibility cross-matching at the facility.",
        tag: "Lab Testing",
      };
    case "admin_verified":
      return {
        summary: "Clinically & Administratively Verified",
        description: "Blood testing passed and administrative compliance checks are validated. Ready for final unit collection and handover.",
        tag: "Audited",
      };
    case "final_completed":
      return {
        summary: "Fulfillment Completed",
        description: "The requested blood units have been collected, certified, and successfully dispatched to the patient.",
        tag: "Fulfilled",
      };
    case "no_donors_available":
      return {
        summary: "No Donors Found in Current Radius",
        description: "No eligible donors responded within the active broadcast window. Expanding search radius or alternative blood bank reserves required.",
        tag: "Action Needed",
      };
    case "rejected":
      return {
        summary: "Request Rejected",
        description: "The request could not be fulfilled and was rejected during medical verification.",
        tag: "Rejected",
      };
    case "cancelled":
      return {
        summary: "Request Cancelled",
        description: "The blood request was cancelled by the requester or administrative authority.",
        tag: "Cancelled",
      };
    default:
      return {
        summary: "Processing Request",
        description: "The blood request is currently progressing through the healthcare network pipeline.",
        tag: status?.replace(/_/g, " "),
      };
  }
}

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Core Data
  const [pendingHospitals, setPendingHospitals] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [actionMsg, setActionMsg] = useState("");

  // Tab & Filter States
  const [activeTab, setActiveTab] = useState("overview"); // "overview" | "hospitals" | "requests"
  const [requestFilter, setRequestFilter] = useState("all"); // "all" | "pending_hospital_approval" | "waiting_for_donor" | "matched" | "final_completed" | "other"
  const [requestSearch, setRequestSearch] = useState("");
  const [hospitalSearch, setHospitalSearch] = useState("");

  // Modal State
  const [selectedRequest, setSelectedRequest] = useState(null);

  useEffect(() => {
    if (user && user.role !== "admin") {
      navigate("/home", { replace: true });
    }
  }, [user, navigate]);

  const fetchData = async () => {
    try {
      setLoadingStats(true);
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

  useEffect(() => {
    fetchData();
  }, []);

  const handleVerifyHospital = async (hospitalId, action) => {
    try {
      const res = await fetch(`${API_BASE}/admin/verify-hospital/${hospitalId}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          notes: action === "approve" ? "Verified by admin" : "Rejected by admin",
        }),
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

  // Stat calculations
  const totalPendingHospitals = pendingHospitals.length;
  const totalRequestsCount = requests.length;
  const fulfilledCount = useMemo(
    () => requests.filter((r) => r.status === "final_completed").length,
    [requests]
  );
  const awaitingApprovalCount = useMemo(
    () => requests.filter((r) => r.status === "pending_hospital_approval").length,
    [requests]
  );

  // Filtered requests list
  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      // Status filter
      if (requestFilter === "final_completed" && r.status !== "final_completed") return false;
      if (requestFilter === "pending_hospital_approval" && r.status !== "pending_hospital_approval") return false;
      if (requestFilter === "waiting_for_donor" && r.status !== "waiting_for_donor") return false;
      if (requestFilter === "matched" && !["matched", "blood_testing", "admin_verified", "blood_test_scheduled"].includes(r.status)) return false;
      if (requestFilter === "other" && ["final_completed", "pending_hospital_approval", "waiting_for_donor", "matched", "blood_testing", "admin_verified", "blood_test_scheduled"].includes(r.status)) return false;

      // Text Search filter (blood group, hospital name, requester name, city)
      if (requestSearch.trim()) {
        const q = requestSearch.toLowerCase().trim();
        const bg = (r.bloodGroup || "").toLowerCase();
        const hosp = (r.assignedHospital?.hospitalName || r.hospitalName || "").toLowerCase();
        const reqBy = (r.requestedBy?.fullName || "").toLowerCase();
        const city = (r.location?.city || "").toLowerCase();
        const id = (r._id || "").toLowerCase();
        if (!bg.includes(q) && !hosp.includes(q) && !reqBy.includes(q) && !city.includes(q) && !id.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [requests, requestFilter, requestSearch]);

  // Filtered hospitals list
  const filteredHospitals = useMemo(() => {
    if (!hospitalSearch.trim()) return pendingHospitals;
    const q = hospitalSearch.toLowerCase().trim();
    return pendingHospitals.filter((h) => {
      const name = (h.hospitalName || h.fullName || "").toLowerCase();
      const reg = (h.registrationNumber || "").toLowerCase();
      const email = (h.email || "").toLowerCase();
      return name.includes(q) || reg.includes(q) || email.includes(q);
    });
  }, [pendingHospitals, hospitalSearch]);

  if (!user || user.role !== "admin") return null;

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
          <span className="dash-nav-label">Admin Control Panel</span>

          {/* Tab 1: Overview */}
          <button
            type="button"
            className={`dash-nav-item ${activeTab === "overview" ? "active" : ""}`}
            onClick={() => setActiveTab("overview")}
            id="nav-tab-overview"
          >
            <OverviewIcon />
            <span>Overview</span>
          </button>

          {/* Tab 2: Hospital Approvals */}
          <button
            type="button"
            className={`dash-nav-item ${activeTab === "hospitals" ? "active" : ""}`}
            onClick={() => setActiveTab("hospitals")}
            id="nav-tab-hospitals"
          >
            <HospitalIcon />
            <span>Hospital Approvals</span>
            {totalPendingHospitals > 0 && (
              <span className="dash-nav-badge">{totalPendingHospitals}</span>
            )}
          </button>

          {/* Tab 3: Blood Requests */}
          <button
            type="button"
            className={`dash-nav-item ${activeTab === "requests" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("requests");
              setRequestFilter("all");
            }}
            id="nav-tab-requests"
          >
            <RequestIcon />
            <span>Blood Requests</span>
            {totalRequestsCount > 0 && (
              <span className="dash-nav-badge">{totalRequestsCount}</span>
            )}
          </button>
        </nav>

        {/* System Administrator Profile Block */}
        <div className="dash-user-block">
          <div className="dash-avatar-shield" title="System Administrator">
            <ShieldIcon size={20} />
            <span className="dash-avatar-status-dot" title="Active Admin Session" />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p className="dash-user-name" title={user.fullName || user.username}>
              {user.fullName || user.username || "Admin"}
            </p>
            <p className="dash-user-role">System Administrator</p>
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
              {activeTab === "overview" && "System Overview"}
              {activeTab === "hospitals" && "Hospital Verifications"}
              {activeTab === "requests" && "Blood Requests Management"}
            </h1>
            <p className="dash-page-sub">
              {activeTab === "overview" && "Monitor network activity, verify medical facilities, and audit life-saving blood requests."}
              {activeTab === "hospitals" && "Review credentials, registration documents, and verify medical centers."}
              {activeTab === "requests" && "Track real-time request lifecycles, donor matching progression, and fulfillment."}
            </p>
          </div>
          <div className="dash-topbar-badge admin-badge">
            <ShieldIcon size={14} />
            <span style={{ marginLeft: "5px" }}>System Administrator</span>
          </div>
        </header>

        {actionMsg && <div className="dash-toast">{actionMsg}</div>}

        {/* ======= Center Interactive Stat Cards (Always visible & interactive) ======= */}
        <section className="dash-stats-grid">
          {/* Stat 1: Pending Hospitals */}
          <div
            className={`dash-stat-card clickable ${activeTab === "hospitals" ? "active-card" : ""}`}
            onClick={() => setActiveTab("hospitals")}
            title="Click to view and verify pending hospitals"
            id="stat-card-pending-hospitals"
          >
            <span className="dash-stat-icon" style={{ color: "#ef4444" }}>
              <HospitalIcon />
            </span>
            <div>
              <p className="dash-stat-label">Pending Hospitals</p>
              <p className="dash-stat-value">{totalPendingHospitals}</p>
              <p className="dash-stat-hint">Click to inspect →</p>
            </div>
          </div>

          {/* Stat 2: Total Requests */}
          <div
            className={`dash-stat-card clickable ${activeTab === "requests" && requestFilter === "all" ? "active-card" : ""}`}
            onClick={() => {
              setActiveTab("requests");
              setRequestFilter("all");
            }}
            title="Click to view all blood requests"
            id="stat-card-total-requests"
          >
            <span className="dash-stat-icon" style={{ color: "#60a5fa" }}>
              <RequestIcon />
            </span>
            <div>
              <p className="dash-stat-label">Total Requests</p>
              <p className="dash-stat-value">{totalRequestsCount}</p>
              <p className="dash-stat-hint">Click to inspect all →</p>
            </div>
          </div>

          {/* Stat 3: Fulfilled Requests */}
          <div
            className={`dash-stat-card clickable ${activeTab === "requests" && requestFilter === "final_completed" ? "active-card" : ""}`}
            onClick={() => {
              setActiveTab("requests");
              setRequestFilter("final_completed");
            }}
            title="Click to view fulfilled blood requests"
            id="stat-card-fulfilled"
          >
            <span className="dash-stat-icon">
              <CheckCircleIcon />
            </span>
            <div>
              <p className="dash-stat-label">Fulfilled</p>
              <p className="dash-stat-value">{fulfilledCount}</p>
              <p className="dash-stat-hint">Click to view completed →</p>
            </div>
          </div>

          {/* Stat 4: Awaiting Approval */}
          <div
            className={`dash-stat-card clickable ${activeTab === "requests" && requestFilter === "pending_hospital_approval" ? "active-card" : ""}`}
            onClick={() => {
              setActiveTab("requests");
              setRequestFilter("pending_hospital_approval");
            }}
            title="Click to view requests awaiting hospital approval"
            id="stat-card-awaiting-approval"
          >
            <span className="dash-stat-icon">
              <ClockPendingIcon />
            </span>
            <div>
              <p className="dash-stat-label">Awaiting Approval</p>
              <p className="dash-stat-value">{awaitingApprovalCount}</p>
              <p className="dash-stat-hint">Click to view pending →</p>
            </div>
          </div>
        </section>

        {/* ========================================================
            VIEW 1: OVERVIEW TAB
            Shows a balanced view with quick links to both sections
           ======================================================== */}
        {activeTab === "overview" && (
          <>
            {/* Section: Pending Hospital Approvals Quick Glance */}
            <section className="dash-section">
              <div className="dash-section-header">
                <h2 className="dash-section-title" style={{ margin: 0 }}>
                  Pending Hospital Verifications
                </h2>
                <button
                  type="button"
                  className="dash-link-btn"
                  onClick={() => setActiveTab("hospitals")}
                >
                  View All ({pendingHospitals.length}) →
                </button>
              </div>

              {loadingStats ? (
                <div className="dash-loading">
                  <span className="dash-spinner" />
                </div>
              ) : pendingHospitals.length === 0 ? (
                <div className="dash-empty">
                  No hospitals currently awaiting verification. All medical centers verified.
                </div>
              ) : (
                <div className="dash-table-wrap">
                  <table className="dash-table">
                    <thead>
                      <tr>
                        <th>Hospital Name</th>
                        <th>Reg. Number</th>
                        <th>Email</th>
                        <th>Registered On</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingHospitals.slice(0, 4).map((h) => (
                        <tr key={h._id}>
                          <td style={{ fontWeight: 600, color: "#fff" }}>
                            {h.hospitalName || h.fullName}
                          </td>
                          <td>{h.registrationNumber || "-"}</td>
                          <td>{h.email}</td>
                          <td>{h.createdAt ? new Date(h.createdAt).toLocaleDateString() : "-"}</td>
                          <td className="dash-actions">
                            <button
                              className="dash-btn approve"
                              onClick={() => handleVerifyHospital(h._id, "approve")}
                            >
                              Approve
                            </button>
                            <button
                              className="dash-btn reject"
                              onClick={() => handleVerifyHospital(h._id, "reject")}
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

            {/* Section: Recent Blood Requests */}
            <section className="dash-section">
              <div className="dash-section-header">
                <h2 className="dash-section-title" style={{ margin: 0 }}>
                  Recent Blood Requests
                </h2>
                <button
                  type="button"
                  className="dash-link-btn"
                  onClick={() => {
                    setActiveTab("requests");
                    setRequestFilter("all");
                  }}
                >
                  View All Requests ({requests.length}) →
                </button>
              </div>

              {loadingStats ? (
                <div className="dash-loading">
                  <span className="dash-spinner" />
                </div>
              ) : requests.length === 0 ? (
                <div className="dash-empty">No blood requests logged in the system.</div>
              ) : (
                <div className="dash-table-wrap">
                  <table className="dash-table">
                    <thead>
                      <tr>
                        <th>Blood Group</th>
                        <th>Qty</th>
                        <th>Emergency</th>
                        <th>Hospital</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {requests.slice(0, 8).map((r) => (
                        <tr
                          key={r._id}
                          className="clickable-row"
                          onClick={() => setSelectedRequest(r)}
                          title="Click to view lifecycle summary"
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
                            {r.assignedHospital?.hospitalName || r.hospitalName || "Pending Assignment"}
                          </td>
                          <td>
                            <span className={`status-badge status-${r.status?.replace(/_/g, "-")}`}>
                              {r.status?.replace(/_/g, " ")}
                            </span>
                          </td>
                          <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                          <td>
                            <button
                              type="button"
                              className="dash-view-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedRequest(r);
                              }}
                            >
                              <EyeIcon /> View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        {/* ========================================================
            VIEW 2: HOSPITAL APPROVALS TAB
           ======================================================== */}
        {activeTab === "hospitals" && (
          <section className="dash-section">
            <div className="dash-toolbar">
              <div className="dash-search-box">
                <span className="dash-search-icon">
                  <SearchIcon />
                </span>
                <input
                  type="text"
                  className="dash-search-input"
                  placeholder="Search hospital name, reg # or email..."
                  value={hospitalSearch}
                  onChange={(e) => setHospitalSearch(e.target.value)}
                />
              </div>
              <div style={{ fontSize: "0.85rem", color: "#9ca3af" }}>
                Showing <strong>{filteredHospitals.length}</strong> pending facility verification(s)
              </div>
            </div>

            {loadingStats ? (
              <div className="dash-loading">
                <span className="dash-spinner" />
              </div>
            ) : filteredHospitals.length === 0 ? (
              <div className="dash-empty">
                {hospitalSearch ? "No matching pending hospitals found." : "No hospitals currently awaiting verification."}
              </div>
            ) : (
              <div className="dash-table-wrap">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Hospital Name</th>
                      <th>Registration No.</th>
                      <th>Contact Email</th>
                      <th>Phone</th>
                      <th>Registered On</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHospitals.map((h) => (
                      <tr key={h._id}>
                        <td style={{ fontWeight: 600, color: "#fff" }}>
                          {h.hospitalName || h.fullName}
                        </td>
                        <td>{h.registrationNumber || "-"}</td>
                        <td>{h.email}</td>
                        <td>{h.hospitalPhone || "-"}</td>
                        <td>{h.createdAt ? new Date(h.createdAt).toLocaleDateString() : "-"}</td>
                        <td className="dash-actions">
                          <button
                            className="dash-btn approve"
                            onClick={() => handleVerifyHospital(h._id, "approve")}
                          >
                            Approve
                          </button>
                          <button
                            className="dash-btn reject"
                            onClick={() => handleVerifyHospital(h._id, "reject")}
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
            VIEW 3: BLOOD REQUESTS TAB
           ======================================================== */}
        {activeTab === "requests" && (
          <section className="dash-section">
            {/* Filter Pills and Search Bar */}
            <div className="dash-toolbar">
              <div className="dash-filters">
                <button
                  type="button"
                  className={`dash-filter-pill ${requestFilter === "all" ? "active" : ""}`}
                  onClick={() => setRequestFilter("all")}
                >
                  All ({requests.length})
                </button>
                <button
                  type="button"
                  className={`dash-filter-pill ${requestFilter === "pending_hospital_approval" ? "active" : ""}`}
                  onClick={() => setRequestFilter("pending_hospital_approval")}
                >
                  Awaiting Approval ({awaitingApprovalCount})
                </button>
                <button
                  type="button"
                  className={`dash-filter-pill ${requestFilter === "waiting_for_donor" ? "active" : ""}`}
                  onClick={() => setRequestFilter("waiting_for_donor")}
                >
                  Waiting for Donor ({requests.filter((r) => r.status === "waiting_for_donor").length})
                </button>
                <button
                  type="button"
                  className={`dash-filter-pill ${requestFilter === "matched" ? "active" : ""}`}
                  onClick={() => setRequestFilter("matched")}
                >
                  Matched / In Testing ({requests.filter((r) => ["matched", "blood_testing", "admin_verified", "blood_test_scheduled"].includes(r.status)).length})
                </button>
                <button
                  type="button"
                  className={`dash-filter-pill ${requestFilter === "final_completed" ? "active" : ""}`}
                  onClick={() => setRequestFilter("final_completed")}
                >
                  Fulfilled ({fulfilledCount})
                </button>
                <button
                  type="button"
                  className={`dash-filter-pill ${requestFilter === "other" ? "active" : ""}`}
                  onClick={() => setRequestFilter("other")}
                >
                  Other / Rejected
                </button>
              </div>

              <div className="dash-search-box">
                <span className="dash-search-icon">
                  <SearchIcon />
                </span>
                <input
                  type="text"
                  className="dash-search-input"
                  placeholder="Search blood group, hospital, city..."
                  value={requestSearch}
                  onChange={(e) => setRequestSearch(e.target.value)}
                />
              </div>
            </div>

            {loadingStats ? (
              <div className="dash-loading">
                <span className="dash-spinner" />
              </div>
            ) : filteredRequests.length === 0 ? (
              <div className="dash-empty">
                No blood requests found matching your filter criteria.
              </div>
            ) : (
              <div className="dash-table-wrap">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Request ID</th>
                      <th>Blood Group</th>
                      <th>Quantity</th>
                      <th>Emergency Level</th>
                      <th>Assigned Hospital</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRequests.map((r) => (
                      <tr
                        key={r._id}
                        className="clickable-row"
                        onClick={() => setSelectedRequest(r)}
                        title="Click to view lifecycle summary"
                      >
                        <td style={{ fontFamily: "monospace", color: "#9ca3af" }}>
                          #{r._id.slice(-6).toUpperCase()}
                        </td>
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
                          {r.assignedHospital?.hospitalName || r.hospitalName || "Pending Assignment"}
                        </td>
                        <td>
                          <span className={`status-badge status-${r.status?.replace(/_/g, "-")}`}>
                            {r.status?.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                        <td>
                          <button
                            type="button"
                            className="dash-view-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedRequest(r);
                            }}
                          >
                            <EyeIcon /> View
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
      </main>

      {/* ========================================================
          BLOOD REQUEST DYNAMIC LIFECYCLE SUMMARY MODAL
          Short dynamic overview till current situation with privacy
         ======================================================== */}
      {selectedRequest && (
        <div className="dash-modal-backdrop" onClick={() => setSelectedRequest(null)}>
          <div className="dash-modal dash-modal-lg" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="dash-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                <h3 className="dash-modal-title">Request #{selectedRequest._id.slice(-6).toUpperCase()}</h3>
                <span className="blood-badge">{selectedRequest.bloodGroup}</span>
                <span className={`emergency-badge ${selectedRequest.emergencyLevel}`}>
                  {selectedRequest.emergencyLevel}
                </span>
                <span style={{ fontSize: "0.8rem", color: "#9ca3af" }}>
                  {selectedRequest.quantity} Unit{selectedRequest.quantity > 1 ? "s" : ""}
                </span>
              </div>
              <button
                type="button"
                className="dash-modal-close"
                onClick={() => setSelectedRequest(null)}
                title="Close"
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div className="dash-modal-body">
              {/* Dynamic Stepper Progression */}
              <div className="lifecycle-card">
                <div className="lifecycle-header">
                  <span className="lifecycle-title">
                    <ShieldIcon size={14} /> Dynamic Lifecycle Progression
                  </span>
                  <span className="current-status-tag">
                    {getLifecycleSituation(selectedRequest.status, selectedRequest).tag}
                  </span>
                </div>

                {/* 5-Stage Visual Stepper */}
                {(() => {
                  const status = selectedRequest.status;
                  const isCompleted = (stage) => {
                    if (stage === 1) return true; // Request creation always completed
                    if (stage === 2) return selectedRequest.hospitalApproved || ["waiting_for_donor", "matched", "blood_testing", "admin_verified", "blood_test_scheduled", "final_completed"].includes(status);
                    if (stage === 3) return selectedRequest.confirmedDonor || ["matched", "blood_testing", "admin_verified", "blood_test_scheduled", "final_completed"].includes(status);
                    if (stage === 4) return ["admin_verified", "final_completed"].includes(status);
                    if (stage === 5) return status === "final_completed";
                    return false;
                  };

                  const isCurrent = (stage) => {
                    if (stage === 1) return false;
                    if (stage === 2) return status === "pending_hospital_approval";
                    if (stage === 3) return status === "waiting_for_donor" || status === "hospital_approved";
                    if (stage === 4) return ["matched", "blood_testing", "blood_test_scheduled"].includes(status);
                    if (stage === 5) return status === "admin_verified";
                    return false;
                  };

                  return (
                    <div className="stepper-container">
                      {/* Step 1: Created */}
                      <div className="step-node completed">
                        <div className="step-circle">✓</div>
                        <span className="step-label">Created</span>
                        <span className="step-time">
                          {new Date(selectedRequest.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      {/* Step 2: Hospital Approved */}
                      <div className={`step-node ${isCompleted(2) ? "completed" : isCurrent(2) ? "current" : status === "rejected" ? "alert-terminal" : ""}`}>
                        <div className="step-circle">{isCompleted(2) ? "✓" : "2"}</div>
                        <span className="step-label">Hospital Review</span>
                        <span className="step-time">
                          {selectedRequest.hospitalApprovedAt ? new Date(selectedRequest.hospitalApprovedAt).toLocaleDateString() : isCurrent(2) ? "In Review" : "-"}
                        </span>
                      </div>

                      {/* Step 3: Donor Match */}
                      <div className={`step-node ${isCompleted(3) ? "completed" : isCurrent(3) ? "current" : status === "no_donors_available" ? "alert-terminal" : ""}`}>
                        <div className="step-circle">{isCompleted(3) ? "✓" : "3"}</div>
                        <span className="step-label">Donor Matching</span>
                        <span className="step-time">
                          {selectedRequest.matchedAt ? new Date(selectedRequest.matchedAt).toLocaleDateString() : isCurrent(3) ? "Broadcasting" : "-"}
                        </span>
                      </div>

                      {/* Step 4: Blood Testing */}
                      <div className={`step-node ${isCompleted(4) ? "completed" : isCurrent(4) ? "current" : ""}`}>
                        <div className="step-circle">{isCompleted(4) ? "✓" : "4"}</div>
                        <span className="step-label">Clinical Testing</span>
                        <span className="step-time">
                          {selectedRequest.bloodTestScheduledAt ? new Date(selectedRequest.bloodTestScheduledAt).toLocaleDateString() : isCurrent(4) ? "In Testing" : "-"}
                        </span>
                      </div>

                      {/* Step 5: Fulfilled */}
                      <div className={`step-node ${isCompleted(5) ? "completed" : isCurrent(5) ? "current" : ""}`}>
                        <div className="step-circle">{isCompleted(5) ? "✓" : "5"}</div>
                        <span className="step-label">Fulfilled</span>
                        <span className="step-time">
                          {selectedRequest.completedAt ? new Date(selectedRequest.completedAt).toLocaleDateString() : isCurrent(5) ? "Ready" : "-"}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* Current Situation Dynamic Banner */}
                <div className="situation-banner">
                  <div className="situation-heading">
                    <ClockPendingIcon />
                    Current Situation: {getLifecycleSituation(selectedRequest.status, selectedRequest).summary}
                  </div>
                  <p className="situation-text">
                    {getLifecycleSituation(selectedRequest.status, selectedRequest).description}
                  </p>
                </div>
              </div>

              {/* Privacy & Security Notice Banner */}
              <div className="privacy-badge-container">
                <span className="privacy-badge-icon">
                  <LockSecurityIcon />
                </span>
                <div>
                  <div className="privacy-badge-title">Confidential Health Record — Security & Privacy Active</div>
                  <p className="privacy-badge-desc">
                    Personal contact details are encrypted and masked under medical privacy guidelines. Only verified clinicians and administrative auditors can facilitate communication.
                  </p>
                </div>
              </div>

              {/* Necessary Details Grid */}
              <div className="detail-grid">
                <div className="detail-item">
                  <div className="detail-item-label">Verified Requester</div>
                  <div className="detail-item-val">
                    {selectedRequest.requestedBy?.fullName || "Verified Patient"}
                  </div>
                </div>

                <div className="detail-item">
                  <div className="detail-item-label">Assigned Hospital</div>
                  <div className="detail-item-val">
                    {selectedRequest.assignedHospital?.hospitalName || selectedRequest.hospitalName || "Pending Assignment"}
                  </div>
                </div>

                <div className="detail-item">
                  <div className="detail-item-label">Blood Group & Units</div>
                  <div className="detail-item-val">
                    <span className="blood-badge">{selectedRequest.bloodGroup}</span>
                    <span>{selectedRequest.quantity} Unit{selectedRequest.quantity > 1 ? "s" : ""}</span>
                  </div>
                </div>

                <div className="detail-item">
                  <div className="detail-item-label">Emergency Priority</div>
                  <div className="detail-item-val">
                    <span className={`emergency-badge ${selectedRequest.emergencyLevel}`}>
                      {selectedRequest.emergencyLevel?.toUpperCase()}
                    </span>
                  </div>
                </div>

                <div className="detail-item">
                  <div className="detail-item-label">Location / City</div>
                  <div className="detail-item-val">
                    {selectedRequest.location?.city
                      ? `${selectedRequest.location.city}${selectedRequest.location.state ? `, ${selectedRequest.location.state}` : ""}`
                      : "Registered City"}
                  </div>
                </div>

                <div className="detail-item">
                  <div className="detail-item-label">Matched Donor</div>
                  <div className="detail-item-val">
                    {selectedRequest.confirmedDonor?.fullName ? (
                      <>
                        <span>{selectedRequest.confirmedDonor.fullName}</span>
                        <span className="blood-badge" style={{ fontSize: "0.7rem", padding: "0.1rem 0.4rem" }}>
                          {selectedRequest.confirmedDonor.bloodGroup}
                        </span>
                      </>
                    ) : selectedRequest.status === "final_completed" ? (
                      "Verified Donor"
                    ) : (
                      <span style={{ color: "#9ca3af", fontWeight: 400 }}>Awaiting Acceptance</span>
                    )}
                  </div>
                </div>

                <div className="detail-item">
                  <div className="detail-item-label">Created Timestamp</div>
                  <div className="detail-item-val" style={{ fontSize: "0.82rem" }}>
                    {new Date(selectedRequest.createdAt).toLocaleString()}
                  </div>
                </div>

                <div className="detail-item">
                  <div className="detail-item-label">Current Pipeline Status</div>
                  <div className="detail-item-val">
                    <span className={`status-badge status-${selectedRequest.status?.replace(/_/g, "-")}`}>
                      {selectedRequest.status?.replace(/_/g, " ")}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="dash-modal-footer">
              <button
                type="button"
                className="dash-btn secondary"
                onClick={() => setSelectedRequest(null)}
              >
                Close Summary
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

