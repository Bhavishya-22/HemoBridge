import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { API_BASE } from "../../config/api";
import { formatRequestStatus } from "../../utils/roleAccess";
import DonationRequestsMap from "../../components/DonationRequestsMap";
import "../styles/bloodFlow.css";

function extractDonorCoords(loc) {
  if (!loc) return null;
  const lat1 = Number(loc.lat);
  const lng1 = Number(loc.lng);
  if (!isNaN(lat1) && !isNaN(lng1) && loc.lat != null && loc.lng != null) {
    return { lat: lat1, lng: lng1 };
  }
  if (loc.coordinates) {
    const lat2 = Number(loc.coordinates.lat);
    const lng2 = Number(loc.coordinates.lng);
    if (!isNaN(lat2) && !isNaN(lng2) && loc.coordinates.lat != null && loc.coordinates.lng != null) {
      return { lat: lat2, lng: lng2 };
    }
    if (Array.isArray(loc.coordinates.coordinates) && loc.coordinates.coordinates.length >= 2) {
      const lng3 = Number(loc.coordinates.coordinates[0]);
      const lat3 = Number(loc.coordinates.coordinates[1]);
      if (!isNaN(lat3) && !isNaN(lng3)) return { lat: lat3, lng: lng3 };
    }
    if (Array.isArray(loc.coordinates) && loc.coordinates.length >= 2) {
      const lng4 = Number(loc.coordinates[0]);
      const lat4 = Number(loc.coordinates[1]);
      if (!isNaN(lat4) && !isNaN(lng4)) return { lat: lat4, lng: lng4 };
    }
  }
  return null;
}

export default function DonateBloodPage() {
  const { user, refreshUser } = useAuth();
  const userId = user?.id || user?._id;
  const [searchParams] = useSearchParams();
  const deepLinkRequestId = searchParams.get("requestId");

  const [openRequests, setOpenRequests] = useState([]);
  const [myAssignments, setMyAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState({ type: "", text: "" });
  const [busyId, setBusyId] = useState(null);

  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      if (typeof refreshUser === "function") {
        refreshUser().catch(() => {});
      }
      const [viewRes, mineRes] = await Promise.all([
        fetch(`${API_BASE}/requests/view`, { credentials: "include" }),
        fetch(`${API_BASE}/donor/my-acceptances`, { credentials: "include" }),
      ]);
      if (viewRes.ok) { const d = await viewRes.json(); setOpenRequests(d.requests || []); }
      if (mineRes.ok) { const d = await mineRes.json(); setMyAssignments(d.data || []); }
    } catch (err) {
      console.error("Donate page load error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleOpenDetails = async (requestId) => {
    setDetailModalOpen(true);
    setDetailLoading(true);
    setDetailError("");
    try {
      const res = await fetch(`${API_BASE}/requests/${requestId}/detail`, { credentials: "include" });
      const data = await res.json();
      if (res.ok && data.data) setSelectedDetail(data.data);
      else setDetailError(data.message || "Failed to load request details.");
    } catch { setDetailError("Unable to connect to server."); }
    finally { setDetailLoading(false); }
  };

  useEffect(() => {
    if (deepLinkRequestId) handleOpenDetails(deepLinkRequestId);
  }, [deepLinkRequestId]);

  const handleAccept = async (requestId) => {
    setBusyId(requestId);
    setActionMsg({ type: "", text: "" });
    try {
      const res = await fetch(`${API_BASE}/requests/${requestId}/accept`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (res.status === 409) { setActionMsg({ type: "error", text: data.message || "Request just matched by another donor." }); await loadData(); return; }
      if (res.status === 410) { setActionMsg({ type: "error", text: data.message || "Acceptance window expired." }); await loadData(); return; }
      if (res.status === 403) { setActionMsg({ type: "error", text: data.message || "Not eligible for this request." }); return; }
      if (!res.ok) { setActionMsg({ type: "error", text: data.message || "Could not accept request." }); return; }
      setActionMsg({ type: "success", text: data.message || "Request accepted! You are now matched." });
      await loadData();
    } catch { setActionMsg({ type: "error", text: "Unable to connect to server. Please try again." }); }
    finally { setBusyId(null); }
  };

  const handleDecline = async (requestId) => {
    setBusyId(requestId);
    setActionMsg({ type: "", text: "" });
    try {
      const res = await fetch(`${API_BASE}/requests/${requestId}/decline`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejectionReason: "Donor declined from dashboard" }),
      });
      const data = await res.json();
      if (!res.ok) { setActionMsg({ type: "error", text: data.message || "Could not decline request." }); return; }
      setActionMsg({ type: "success", text: data.message || "Request declined." });
      await loadData();
    } catch { setActionMsg({ type: "error", text: "Unable to connect to server." }); }
    finally { setBusyId(null); }
  };

  return (
    <div className="flow-page">
      {/* Page header */}
      <header className="flow-header">
        <h1 className="flow-title">Donate Blood</h1>
        <p className="flow-sub">
          Open blood requests compatible with your blood group near you are listed below.
          Accept to commit to donating — first valid response wins the match.
        </p>
      </header>

      {/* Action alert */}
      {actionMsg.text && (
        <div className={`flow-alert ${actionMsg.type}`}>
          {actionMsg.text}
        </div>
      )}

      {/* Content */}
      <div className="flow-content">
        {loading ? (
          <div className="flow-loading">
            <span className="flow-spinner" />
          </div>
        ) : (
          <div className="flow-grid single-col">
            <section className="flow-card">
              <h2>Open requests near you</h2>

              {openRequests.length > 0 && (
                <DonationRequestsMap
                  donorCoords={extractDonorCoords(user?.location)}
                  requests={openRequests}
                  onAccept={handleAccept}
                  busyId={busyId}
                />
              )}

              {openRequests.length === 0 ? (
                <div className="flow-empty">
                  No open compatible requests right now.<br />
                  You'll see requests here when hospital-approved requests match your blood group.
                </div>
              ) : (
                <div className="flow-list">
                  {openRequests.map((req) => {
                    const recipient = req.requestedBy?.fullName || "Patient in need";
                    const loc = req.location || req.requestedBy?.location;
                    const distanceDisplay =
                      typeof req.distanceKm === "number" ? `${req.distanceKm.toFixed(1)} km away` : null;

                    return (
                      <article key={req._id} className="flow-request-item">
                        <div className="flow-request-top">
                          <span className="flow-badge blood">{req.bloodGroup}</span>
                          <span className={`flow-badge emergency-${req.emergencyLevel}`}>{req.emergencyLevel}</span>
                          <span className="flow-badge status">{formatRequestStatus(req.status)}</span>
                          {distanceDisplay && (
                            <span className="flow-badge" style={{ background: "#e0f2fe", color: "#0369a1" }}>
                              📍 {distanceDisplay}
                            </span>
                          )}
                        </div>
                        <p className="flow-meta">
                          <strong>{req.quantity} unit{req.quantity > 1 ? "s" : ""}</strong> needed for <strong>{recipient}</strong>
                        </p>
                        <p className="flow-meta">
                          📍 {loc?.city || "—"}, {loc?.state || "—"}
                          {req.hospitalName ? ` · 🏥 ${req.hospitalName}` : ""}
                        </p>
                        {req.description && <p className="flow-meta">{req.description}</p>}
                        {req.acceptanceDeadline && (
                          <p className="flow-meta" style={{ color: "#d97706", fontWeight: 500 }}>
                            ⏳ Open until: {new Date(req.acceptanceDeadline).toLocaleString()}
                          </p>
                        )}
                        <div className="flow-actions">
                          <button
                            type="button"
                            className="flow-btn"
                            disabled={busyId === req._id}
                            onClick={() => handleAccept(req._id)}
                          >
                            {busyId === req._id ? "Processing…" : "✓ Accept Request"}
                          </button>
                          <button
                            type="button"
                            className="flow-btn danger"
                            disabled={busyId === req._id}
                            onClick={() => handleDecline(req._id)}
                          >
                            ✕ Decline
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              <h3 className="flow-section-title">Your matched &amp; ongoing donations</h3>
              {myAssignments.length === 0 ? (
                <div className="flow-empty">No active or ongoing donations yet.</div>
              ) : (
                <div className="flow-list">
                  {myAssignments.map((req) => {
                    const recipient = req.requestedBy?.fullName || "Patient";
                    const loc = req.location || req.requestedBy?.location;
                    const isConfirmedForMe =
                      (req.confirmedDonor?._id || req.confirmedDonor)?.toString() === userId?.toString();

                    return (
                      <article key={req._id} className="flow-request-item">
                        <div className="flow-request-top">
                          <span className="flow-badge blood">{req.bloodGroup}</span>
                          <span className={`flow-badge emergency-${req.emergencyLevel}`}>{req.emergencyLevel}</span>
                          <span className="flow-badge status">{formatRequestStatus(req.status)}</span>
                          {isConfirmedForMe && (
                            <span className="flow-badge" style={{ background: "#dcfce7", color: "#166534" }}>
                              ✅ Matched to You
                            </span>
                          )}
                        </div>
                        <p className="flow-meta">
                          <strong>{req.quantity} unit{req.quantity > 1 ? "s" : ""}</strong> for <strong>{recipient}</strong>
                        </p>
                        <p className="flow-meta">
                          📍 {loc?.city || "—"}, {loc?.state || "—"}
                          {req.hospitalName ? ` · 🏥 ${req.hospitalName}` : ""}
                        </p>
                        <p className="flow-meta">
                          Matched: {req.matchedAt
                            ? new Date(req.matchedAt).toLocaleString()
                            : new Date(req.updatedAt).toLocaleString()}
                        </p>
                        <div className="flow-actions">
                          <button type="button" className="flow-btn" onClick={() => handleOpenDetails(req._id)}>
                            📋 View Details
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {detailModalOpen && (
        <div className="flow-modal-backdrop" onClick={() => setDetailModalOpen(false)}>
          <div className="flow-modal" onClick={(e) => e.stopPropagation()}>
            <div className="flow-modal-header">
              <h3 className="flow-modal-title">Matched Donation Details</h3>
              <button className="flow-modal-close" onClick={() => setDetailModalOpen(false)} title="Close">
                &times;
              </button>
            </div>

            <div className="flow-modal-body">
              {detailLoading ? (
                <div className="flow-loading" style={{ padding: "2rem" }}>
                  <span className="flow-spinner" />
                </div>
              ) : detailError ? (
                <div className="flow-alert error">{detailError}</div>
              ) : selectedDetail ? (
                <>
                  <div className="flow-detail-section">
                    <div className="flow-detail-section-title">👤 Receiver Information</div>
                    <div className="flow-detail-row">
                      <span className="flow-detail-label">Recipient Name</span>
                      <span className="flow-detail-value">{selectedDetail.receiver?.fullName || "Patient in Need"}</span>
                    </div>
                    <div className="flow-detail-row">
                      <span className="flow-detail-label">Contact Phone</span>
                      <span className="flow-detail-value">
                        {selectedDetail.receiver?.phoneNumber ? (
                          <a href={`tel:${selectedDetail.receiver.phoneNumber}`} style={{ color: "#b91c1c", textDecoration: "underline" }}>
                            📞 {selectedDetail.receiver.phoneNumber}
                          </a>
                        ) : "Not provided"}
                      </span>
                    </div>
                    {selectedDetail.receiver?.location?.city && (
                      <div className="flow-detail-row">
                        <span className="flow-detail-label">City / State</span>
                        <span className="flow-detail-value">
                          {selectedDetail.receiver.location.city}, {selectedDetail.receiver.location.state || ""}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flow-detail-section">
                    <div className="flow-detail-section-title">🏥 Hospital for Blood Testing</div>
                    <div className="flow-detail-row">
                      <span className="flow-detail-label">Hospital Name</span>
                      <span className="flow-detail-value">
                        {selectedDetail.assignedHospital?.hospitalName ||
                          selectedDetail.assignedHospital?.fullName ||
                          "Assigned Hospital"}
                      </span>
                    </div>
                    <div className="flow-detail-row">
                      <span className="flow-detail-label">Address</span>
                      <span className="flow-detail-value">
                        {selectedDetail.assignedHospital?.hospitalAddress || "Provided by hospital"}
                      </span>
                    </div>
                    {selectedDetail.assignedHospital?.hospitalPhone && (
                      <div className="flow-detail-row">
                        <span className="flow-detail-label">Contact</span>
                        <span className="flow-detail-value">
                          <a href={`tel:${selectedDetail.assignedHospital.hospitalPhone}`} style={{ color: "#b91c1c", textDecoration: "underline" }}>
                            📞 {selectedDetail.assignedHospital.hospitalPhone}
                          </a>
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flow-detail-section">
                    <div className="flow-detail-section-title">🩸 Request Specifications</div>
                    <div className="flow-detail-row">
                      <span className="flow-detail-label">Blood Group</span>
                      <span className="flow-badge blood">{selectedDetail.bloodGroup}</span>
                    </div>
                    <div className="flow-detail-row">
                      <span className="flow-detail-label">Quantity</span>
                      <span className="flow-detail-value">{selectedDetail.quantity} unit(s)</span>
                    </div>
                    <div className="flow-detail-row">
                      <span className="flow-detail-label">Emergency Level</span>
                      <span className={`flow-badge emergency-${selectedDetail.emergencyLevel}`}>
                        {selectedDetail.emergencyLevel}
                      </span>
                    </div>
                    <div className="flow-detail-row">
                      <span className="flow-detail-label">Status</span>
                      <span className="flow-badge status">{formatRequestStatus(selectedDetail.status)}</span>
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            <div className="flow-modal-footer">
              <button type="button" className="flow-btn" onClick={() => setDetailModalOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
