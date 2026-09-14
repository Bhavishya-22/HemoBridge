import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { API_BASE } from "../../config/api";
import { useAuth } from "../../context/AuthContext";
import { formatRequestStatus } from "../../utils/roleAccess";
import LocationPickerMap from "../../components/LocationPickerMap";
import ConfirmedDonorMap from "../../components/ConfirmedDonorMap";
import "../styles/bloodFlow.css";

function extractCoords(loc) {
  if (!loc) return null;
  if (typeof loc.lat === "number" && typeof loc.lng === "number") return { lat: loc.lat, lng: loc.lng };
  if (loc.coordinates) {
    if (typeof loc.coordinates.lat === "number" && typeof loc.coordinates.lng === "number")
      return { lat: loc.coordinates.lat, lng: loc.coordinates.lng };
    if (Array.isArray(loc.coordinates.coordinates) && loc.coordinates.coordinates.length >= 2)
      return { lat: loc.coordinates.coordinates[1], lng: loc.coordinates.coordinates[0] };
    if (Array.isArray(loc.coordinates) && loc.coordinates.length >= 2)
      return { lat: loc.coordinates[1], lng: loc.coordinates[0] };
  }
  return null;
}

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const EMERGENCY_LEVELS = ["low", "medium", "high", "critical"];

const EMPTY_FORM = {
  bloodGroup: "",
  quantity: 1,
  emergencyLevel: "medium",
  hospitalName: "",
  description: "",
  city: "",
  state: "",
};

export default function RequestBloodPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const deepLinkRequestId = searchParams.get("requestId");

  const [form, setForm] = useState(EMPTY_FORM);
  const [coords, setCoords] = useState({ lat: null, lng: null, status: "idle" });
  const [myRequests, setMyRequests] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

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

  const loadMyRequests = async () => {
    try {
      const res = await fetch(`${API_BASE}/requests/my-requests`, { credentials: "include" });
      if (res.ok) { const data = await res.json(); setMyRequests(data.requests || []); }
    } catch (err) { console.error("Failed to load requests:", err); }
    finally { setLoadingList(false); }
  };

  useEffect(() => {
    // Geolocation
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      setCoords((p) => ({ ...p, status: "acquiring" }));
      navigator.geolocation.getCurrentPosition(
        (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, status: "granted" }),
        (err) => { console.warn("Geolocation:", err.message); setCoords((p) => ({ ...p, status: "denied" })); },
        { timeout: 8000 }
      );
    } else {
      setCoords((p) => ({ ...p, status: "unavailable" }));
    }

    // Prefill from profile
    const prefill = async () => {
      try {
        const res = await fetch(`${API_BASE}/user/profile`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          const u = data.user;
          setForm((prev) => ({
            ...prev,
            bloodGroup: u?.bloodGroup || prev.bloodGroup,
            city: u?.location?.city || prev.city,
            state: u?.location?.state || prev.state,
          }));
        }
      } catch { /* ignore */ }
    };

    prefill();
    loadMyRequests();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: name === "quantity" ? Number(value) : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage({ type: "", text: "" });

    if (!form.bloodGroup || !form.quantity || !form.city || !form.state) {
      setMessage({ type: "error", text: "Blood group, quantity, city, and state are required." });
      return;
    }

    setSubmitting(true);
    try {
      const locationPayload = {
        city: form.city,
        state: form.state,
        ...(coords.lat != null && coords.lng != null
          ? { coordinates: { lat: coords.lat, lng: coords.lng } }
          : {}),
      };

      const res = await fetch(`${API_BASE}/requests/create`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bloodGroup: form.bloodGroup,
          quantity: form.quantity,
          emergencyLevel: form.emergencyLevel,
          hospitalName: form.hospitalName,
          description: form.description,
          location: locationPayload,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setMessage({ type: "error", text: data.message || "Could not create request." }); return; }
      setMessage({ type: "success", text: data.message || "Request submitted! A hospital will verify it next." });
      setForm((prev) => ({ ...EMPTY_FORM, bloodGroup: prev.bloodGroup, city: prev.city, state: prev.state }));
      await loadMyRequests();
    } catch { setMessage({ type: "error", text: "Unable to connect to server. Please try again." }); }
    finally { setSubmitting(false); }
  };

  const geoStatusMsg = {
    acquiring: "🔵 Detecting your location…",
    granted: `🟢 Location captured: ${coords.lat?.toFixed(4)}°, ${coords.lng?.toFixed(4)}°`,
    denied: "🟡 Location permission denied — map pin will be used.",
    unavailable: "🟡 Geolocation unavailable — map pin will be used.",
  }[coords.status] || "";

  return (
    <div className="flow-page">
      {/* Page header */}
      <header className="flow-header">
        <h1 className="flow-title">Request Blood</h1>
        <p className="flow-sub">
          Submit an urgent or planned blood request. After hospital approval, eligible donors near you are notified automatically.
        </p>
      </header>

      {/* Content */}
      <div className="flow-content">
        <div className="flow-grid">

          {/* ── Left: New Request Form ── */}
          <section className="flow-card">
            <h2>New request</h2>
            {message.text && (
              <div className={`flow-alert ${message.type}`} role="alert">
                {message.text}
              </div>
            )}
            <form className="flow-form" onSubmit={handleSubmit}>
              <div className="flow-row">
                <div className="flow-field">
                  <label htmlFor="bloodGroup">Blood group</label>
                  <select id="bloodGroup" name="bloodGroup" value={form.bloodGroup} onChange={handleChange} required>
                    <option value="">Select</option>
                    {BLOOD_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div className="flow-field">
                  <label htmlFor="quantity">Units needed</label>
                  <input
                    id="quantity" name="quantity" type="number"
                    min={1} max={10} value={form.quantity} onChange={handleChange} required
                  />
                </div>
              </div>

              <div className="flow-field">
                <label htmlFor="emergencyLevel">Emergency level</label>
                <select id="emergencyLevel" name="emergencyLevel" value={form.emergencyLevel} onChange={handleChange}>
                  {EMERGENCY_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
                </select>
              </div>

              <LocationPickerMap
                initialLat={coords.lat}
                initialLng={coords.lng}
                onLocationChange={({ lat, lng, city, state }) => {
                  setCoords({ lat, lng, status: "granted" });
                  setForm((prev) => ({ ...prev, city: city || prev.city, state: state || prev.state }));
                }}
                label="Patient Location (Map)"
                height="260px"
              />

              <div className="flow-row">
                <div className="flow-field">
                  <label htmlFor="city">City</label>
                  <input id="city" name="city" value={form.city} onChange={handleChange} required placeholder="e.g. Hyderabad" />
                </div>
                <div className="flow-field">
                  <label htmlFor="state">State</label>
                  <input id="state" name="state" value={form.state} onChange={handleChange} required placeholder="e.g. Telangana" />
                </div>
              </div>

              {geoStatusMsg && (
                <p className="flow-geo-status">{geoStatusMsg}</p>
              )}

              <div className="flow-field">
                <label htmlFor="hospitalName">Preferred hospital <span style={{ fontWeight: 400, color: "#94a3b8" }}>(optional)</span></label>
                <input
                  id="hospitalName" name="hospitalName"
                  value={form.hospitalName} onChange={handleChange}
                  placeholder="Hospital name"
                />
              </div>

              <div className="flow-field">
                <label htmlFor="description">Additional details <span style={{ fontWeight: 400, color: "#94a3b8" }}>(optional)</span></label>
                <textarea
                  id="description" name="description"
                  value={form.description} onChange={handleChange}
                  placeholder="Patient context, ward, contact person…"
                />
              </div>

              <button type="submit" className="flow-btn" disabled={submitting}>
                {submitting ? "Submitting…" : "Submit request"}
              </button>
            </form>
          </section>

          {/* ── Right: My Requests List ── */}
          <section className="flow-card">
            <h2>Your requests</h2>
            {loadingList ? (
              <div className="flow-loading">
                <span className="flow-spinner" />
              </div>
            ) : myRequests.length === 0 ? (
              <div className="flow-empty">
                No requests yet.<br />Submit your first request using the form on the left.
              </div>
            ) : (
              <div className="flow-list">
                {myRequests.map((req) => {
                  const matched = req.confirmedDonor || req.selectedDonor;
                  const receiverCoords = extractCoords(req.location) || extractCoords(user?.location);
                  const donorCoords = extractCoords(matched?.location);

                  return (
                    <article key={req._id} className="flow-request-item">
                      <div className="flow-request-top">
                        <span className="flow-badge blood">{req.bloodGroup}</span>
                        <span className={`flow-badge emergency-${req.emergencyLevel}`}>{req.emergencyLevel}</span>
                        <span className="flow-badge status">{formatRequestStatus(req.status)}</span>
                      </div>
                      <p className="flow-meta">
                        <strong>{req.quantity} unit{req.quantity > 1 ? "s" : ""}</strong> ·{" "}
                        📍 {req.location?.city || "—"}, {req.location?.state || "—"}
                      </p>
                      {matched?.fullName && (
                        <p className="flow-meta">
                          ✅ Matched donor: <strong>{matched.fullName}</strong> ({matched.bloodGroup})
                        </p>
                      )}
                      <p className="flow-meta" style={{ color: "#94a3b8", fontSize: "0.8rem" }}>
                        Submitted {new Date(req.createdAt).toLocaleString()}
                      </p>

                      {Boolean(matched && receiverCoords && donorCoords) && (
                        <ConfirmedDonorMap
                          receiverCoords={receiverCoords}
                          donorCoords={donorCoords}
                          height="200px"
                        />
                      )}

                      {Boolean(matched || ["matched", "blood_test_scheduled", "final_completed"].includes(req.status)) && (
                        <div className="flow-actions">
                          <button
                            type="button"
                            className="flow-btn"
                            onClick={() => handleOpenDetails(req._id)}
                          >
                            📋 View Details
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Detail Modal */}
      {detailModalOpen && (
        <div className="flow-modal-backdrop" onClick={() => setDetailModalOpen(false)}>
          <div className="flow-modal" onClick={(e) => e.stopPropagation()}>
            <div className="flow-modal-header">
              <h3 className="flow-modal-title">Donor &amp; Request Details</h3>
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
                    <div className="flow-detail-section-title">🩸 Confirmed Donor Profile</div>
                    {selectedDetail.confirmedDonor ? (
                      <>
                        <div className="flow-detail-row">
                          <span className="flow-detail-label">Donor Name</span>
                          <span className="flow-detail-value">{selectedDetail.confirmedDonor.fullName}</span>
                        </div>
                        <div className="flow-detail-row">
                          <span className="flow-detail-label">Contact Phone</span>
                          <span className="flow-detail-value">
                            {selectedDetail.confirmedDonor.phoneNumber ? (
                              <a href={`tel:${selectedDetail.confirmedDonor.phoneNumber}`} style={{ color: "#b91c1c", textDecoration: "underline" }}>
                                📞 {selectedDetail.confirmedDonor.phoneNumber}
                              </a>
                            ) : "Not provided"}
                          </span>
                        </div>
                        <div className="flow-detail-row">
                          <span className="flow-detail-label">Blood Group</span>
                          <span className="flow-badge blood">{selectedDetail.confirmedDonor.bloodGroup}</span>
                        </div>
                        <div className="flow-detail-row">
                          <span className="flow-detail-label">Weight</span>
                          <span className="flow-detail-value">
                            {selectedDetail.confirmedDonor.weight ? `${selectedDetail.confirmedDonor.weight} kg` : "—"}
                          </span>
                        </div>
                        <div className="flow-detail-row">
                          <span className="flow-detail-label">Health Conditions</span>
                          <span className="flow-detail-value">
                            {selectedDetail.confirmedDonor.diseases?.length
                              ? selectedDetail.confirmedDonor.diseases.join(", ")
                              : "None reported (Clean)"}
                          </span>
                        </div>
                      </>
                    ) : (
                      <p className="flow-meta" style={{ padding: "0.5rem 0" }}>Waiting for donor match.</p>
                    )}
                  </div>

                  <div className="flow-detail-section">
                    <div className="flow-detail-section-title">🏥 Testing Hospital</div>
                    <div className="flow-detail-row">
                      <span className="flow-detail-label">Hospital</span>
                      <span className="flow-detail-value">
                        {selectedDetail.assignedHospital?.hospitalName ||
                          selectedDetail.assignedHospital?.fullName ||
                          "Assigned Hospital"}
                      </span>
                    </div>
                    {selectedDetail.assignedHospital?.hospitalAddress && (
                      <div className="flow-detail-row">
                        <span className="flow-detail-label">Address</span>
                        <span className="flow-detail-value">{selectedDetail.assignedHospital.hospitalAddress}</span>
                      </div>
                    )}
                    {selectedDetail.assignedHospital?.hospitalPhone && (
                      <div className="flow-detail-row">
                        <span className="flow-detail-label">Phone</span>
                        <span className="flow-detail-value">{selectedDetail.assignedHospital.hospitalPhone}</span>
                      </div>
                    )}
                  </div>

                  <div className="flow-detail-section">
                    <div className="flow-detail-section-title">📋 Status &amp; Request Info</div>
                    <div className="flow-detail-row">
                      <span className="flow-detail-label">Status</span>
                      <span className="flow-badge status">{formatRequestStatus(selectedDetail.status)}</span>
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
