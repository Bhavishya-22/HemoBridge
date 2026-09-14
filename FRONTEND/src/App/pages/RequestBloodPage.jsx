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

  // ── Presence mode ────────────────────────────────────────────────────────
  // "at_hospital" → user is physically at the hospital (single location)
  // "remote"      → user is elsewhere; must pick a hospital separately
  const [presenceMode, setPresenceMode] = useState("at_hospital");

  // ── Hospital picker (remote mode) ────────────────────────────────────────
  const [hospitals, setHospitals] = useState([]);
  const [hospitalsLoading, setHospitalsLoading] = useState(false);
  const [selectedHospital, setSelectedHospital] = useState(null); // full hospital object from DB
  const [useManualHospital, setUseManualHospital] = useState(false); // true when hospital not in DB
  const [manualHospital, setManualHospital] = useState({ name: "", address: "", city: "", state: "", lat: null, lng: null });

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

  // ── Load verified hospitals for the picker ───────────────────────────────
  useEffect(() => {
    const loadHospitals = async () => {
      setHospitalsLoading(true);
      try {
        const res = await fetch(`${API_BASE}/hospitals/all`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          // Filter to only verified hospitals
          const verified = (data.hospitals || data.data || []).filter(
            (h) => h.hospitalVerified || h.hospitalVerificationStatus === "verified"
          );
          setHospitals(verified);
        }
      } catch (err) {
        console.warn("Could not load hospital list:", err);
      } finally {
        setHospitalsLoading(false);
      }
    };
    loadHospitals();
  }, []);

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

          let initialLat = null;
          let initialLng = null;
          const loc = u?.location;
          if (loc) {
            if (typeof loc.lat === "number" && typeof loc.lng === "number") {
              initialLat = loc.lat;
              initialLng = loc.lng;
            } else if (loc.coordinates) {
              if (typeof loc.coordinates.lat === "number" && typeof loc.coordinates.lng === "number") {
                initialLat = loc.coordinates.lat;
                initialLng = loc.coordinates.lng;
              } else if (Array.isArray(loc.coordinates.coordinates) && loc.coordinates.coordinates.length >= 2) {
                initialLng = loc.coordinates.coordinates[0];
                initialLat = loc.coordinates.coordinates[1];
              } else if (Array.isArray(loc.coordinates) && loc.coordinates.length >= 2) {
                initialLng = loc.coordinates[0];
                initialLat = loc.coordinates[1];
              }
            }
          }
          if (initialLat != null && initialLng != null) {
            setCoords({ lat: initialLat, lng: initialLng, status: "granted" });
          }
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

  // ── Hospital picker change ────────────────────────────────────────────────
  const handleHospitalSelect = (e) => {
    const hId = e.target.value;
    if (!hId) { setSelectedHospital(null); return; }
    const h = hospitals.find((x) => x._id === hId);
    setSelectedHospital(h || null);
    // Selecting from dropdown clears manual entry
    setUseManualHospital(false);
    setManualHospital({ name: "", city: "", state: "" });
  };

  const handleManualHospitalChange = (e) => {
    const { name, value } = e.target;
    setManualHospital((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage({ type: "", text: "" });

    if (!form.bloodGroup || !form.quantity || !form.city || !form.state) {
      setMessage({ type: "error", text: "Blood group, quantity, city, and state are required." });
      return;
    }

    // Hospital requirement: must have EITHER a dropdown hospital OR manual hospital details
    if (!selectedHospital && !useManualHospital) {
      setMessage({ type: "error", text: "Please select a hospital from the list or enter your hospital details manually." });
      return;
    }
    if (useManualHospital && !manualHospital.name.trim()) {
      setMessage({ type: "error", text: "Please enter the hospital name." });
      return;
    }
    if (useManualHospital && (!manualHospital.city.trim() || !manualHospital.state.trim())) {
      setMessage({ type: "error", text: "Please enter the hospital city and state." });
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

      // ── Build hospital-related payload ──────────────────────────────────────
      let hospitalNameToSend = form.hospitalName;
      let preferredHospitalId = undefined;
      let hospitalLocationPayload = undefined;

      if (selectedHospital && !useManualHospital) {
        // Hospital selected from DB dropdown → route exclusively to that hospital
        hospitalNameToSend = selectedHospital.hospitalName || selectedHospital.fullName;
        preferredHospitalId = selectedHospital._id;
        hospitalLocationPayload = {
          address: selectedHospital.hospitalAddress || "",
          city: selectedHospital.location?.city || "",
          state: selectedHospital.location?.state || "",
          ...(selectedHospital.location?.coordinates
            ? { coordinates: selectedHospital.location.coordinates }
            : {}),
        };
      } else if (useManualHospital) {
        // Manual entry → hospital details with exact address and location
        hospitalNameToSend = manualHospital.name;
        preferredHospitalId = undefined;
        hospitalLocationPayload = {
          address: manualHospital.address || "",
          city: manualHospital.city,
          state: manualHospital.state,
          ...(manualHospital.lat != null && manualHospital.lng != null
            ? { coordinates: { lat: manualHospital.lat, lng: manualHospital.lng } }
            : {}),
        };
      }

      const res = await fetch(`${API_BASE}/requests/create`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bloodGroup: form.bloodGroup,
          quantity: form.quantity,
          emergencyLevel: form.emergencyLevel,
          hospitalName: hospitalNameToSend,
          description: form.description,
          location: locationPayload,
          presenceMode,
          preferredHospital: preferredHospitalId,
          hospitalLocation: hospitalLocationPayload,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setMessage({ type: "error", text: data.message || "Could not create request." }); return; }
      setMessage({ type: "success", text: data.message || "Request submitted! A hospital will verify it next." });
      setForm((prev) => ({ ...EMPTY_FORM, bloodGroup: prev.bloodGroup, city: prev.city, state: prev.state }));
      setSelectedHospital(null);
      setUseManualHospital(false);
      setManualHospital({ name: "", city: "", state: "" });
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

              {/* ── Presence Mode Toggle ── */}
              <div>
                <div style={{ fontSize: "0.83rem", fontWeight: 700, color: "#334155", marginBottom: "0.55rem", letterSpacing: "0.01em" }}>
                  Where are you right now?
                </div>
                <div className="flow-mode-toggle" role="group" aria-label="Presence mode">
                  <button
                    type="button"
                    id="mode-at-hospital"
                    className={`flow-mode-btn${presenceMode === "at_hospital" ? " active" : ""}`}
                    onClick={() => { setPresenceMode("at_hospital"); setSelectedHospital(null); }}
                  >
                    <span className="mode-icon">🏥</span>
                    Present in the hospital
                  </button>
                  <button
                    type="button"
                    id="mode-remote"
                    className={`flow-mode-btn${presenceMode === "remote" ? " active" : ""}`}
                    onClick={() => setPresenceMode("remote")}
                  >
                    <span className="mode-icon">📍</span>
                    Not present in the hospital
                  </button>
                </div>
                <p style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: "0.35rem", lineHeight: 1.5 }}>
                  {presenceMode === "at_hospital"
                    ? "Your location will be used for both the request and hospital matching."
                    : "Enter your current location below, then select the hospital you've contacted."}
                </p>
              </div>

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

              {/* Patient location map — always visible (used for donor proximity) */}
              <LocationPickerMap
                initialLat={coords.lat}
                initialLng={coords.lng}
                onLocationChange={({ lat, lng, city, state }) => {
                  setCoords({ lat, lng, status: "granted" });
                  setForm((prev) => ({ ...prev, city: city || prev.city, state: state || prev.state }));
                }}
                label={presenceMode === "at_hospital" ? "Your Location (Map)" : "Your Current Location (Map)"}
                height="240px"
              />

              <div className="flow-row">
                <div className="flow-field">
                  <label htmlFor="city">{presenceMode === "at_hospital" ? "City" : "Your city"}</label>
                  <input id="city" name="city" value={form.city} onChange={handleChange} required placeholder="e.g. Hyderabad" />
                </div>
                <div className="flow-field">
                  <label htmlFor="state">{presenceMode === "at_hospital" ? "State" : "Your state"}</label>
                  <input id="state" name="state" value={form.state} onChange={handleChange} required placeholder="e.g. Telangana" />
                </div>
              </div>

              {geoStatusMsg && (
                <p className="flow-geo-status">{geoStatusMsg}</p>
              )}

              {/* ── Hospital picker (remote mode only) ── */}
                <div className="flow-hospital-picker">
                  <div className="flow-hospital-picker-label">
                    🏥 {presenceMode === "at_hospital" ? "Hospital you are admitted in" : "Hospital you contacted"}
                    <span style={{ fontWeight: 400, color: "#b91c1c", fontSize: "0.75rem" }}> (required)</span>
                  </div>

                  {/* Dropdown — hidden when manual mode is active */}
                  {!useManualHospital && (
                    <>
                      {hospitalsLoading ? (
                        <div className="flow-hospital-loading">
                          <span className="flow-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                          Loading verified hospitals…
                        </div>
                      ) : hospitals.length === 0 ? (
                        <p style={{ fontSize: "0.82rem", color: "#94a3b8" }}>
                          No verified hospitals found in our system.
                        </p>
                      ) : (
                        <select
                          id="hospitalPicker"
                          value={selectedHospital?._id || ""}
                          onChange={handleHospitalSelect}
                        >
                          <option value="">— Choose a hospital —</option>
                          {hospitals.map((h) => (
                            <option key={h._id} value={h._id}>
                              {h.hospitalName || h.fullName}
                              {h.hospitalAddress ? ` · ${h.hospitalAddress}` : ""}
                              {h.location?.city ? ` · ${h.location.city}` : ""}
                              {h.location?.state ? `, ${h.location.state}` : ""}
                            </option>
                          ))}
                        </select>
                      )}

                      {selectedHospital && (
                        <div className="flow-hospital-selected-info">
                          <span className="info-icon">✅</span>
                          <div>
                            <strong>{selectedHospital.hospitalName || selectedHospital.fullName}</strong>
                            {selectedHospital.hospitalAddress && (
                              <span>📍 {selectedHospital.hospitalAddress}</span>
                            )}
                            {selectedHospital.hospitalPhone && (
                              <span style={{ display: "block", marginTop: "0.15rem" }}>
                                📞 <a href={`tel:${selectedHospital.hospitalPhone}`} style={{ color: "#065f46", textDecoration: "underline" }}>
                                  {selectedHospital.hospitalPhone}
                                </a>
                              </span>
                            )}
                            {(selectedHospital.location?.city || selectedHospital.location?.state) && (
                              <span style={{ display: "block", marginTop: "0.15rem", color: "#047857" }}>
                                {[selectedHospital.location.city, selectedHospital.location.state].filter(Boolean).join(", ")}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* ── "Not in list" toggle ── */}
                  <button
                    type="button"
                    id="toggle-manual-hospital"
                    style={{
                      background: "none",
                      border: "none",
                      padding: "0.2rem 0",
                      fontSize: "0.8rem",
                      color: useManualHospital ? "#b91c1c" : "#64748b",
                      cursor: "pointer",
                      textDecoration: "underline",
                      textAlign: "left",
                      fontWeight: useManualHospital ? 700 : 500,
                    }}
                    onClick={() => {
                      setUseManualHospital((v) => !v);
                      setSelectedHospital(null);
                    }}
                  >
                    {useManualHospital
                      ? "← Go back to hospital list"
                      : "My hospital is not in the list — enter manually"}
                  </button>

                  {/* ── Manual hospital entry fields ── */}
                  {useManualHospital && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem", animation: "flow-fadein 0.18s ease-out" }}>
                      <div style={{
                        background: "#fffbeb",
                        border: "1px solid #fcd34d",
                        borderRadius: 10,
                        padding: "0.6rem 0.85rem",
                        fontSize: "0.78rem",
                        color: "#92400e",
                        lineHeight: 1.5,
                      }}>
                        ℹ️ Enter the exact hospital name and address/location. Only this hospital with matching details will review and verify your request.
                      </div>

                      {/* Hospital name */}
                      <div className="flow-field" style={{ margin: 0 }}>
                        <label htmlFor="manualHospitalName" style={{ fontSize: "0.8rem", fontWeight: 600, color: "#334155", marginBottom: "0.35rem", display: "block" }}>
                          Hospital name <span style={{ color: "#b91c1c" }}>*</span>
                        </label>
                        <input
                          id="manualHospitalName"
                          name="name"
                          value={manualHospital.name}
                          onChange={handleManualHospitalChange}
                          placeholder="e.g. Apollo Hospitals"
                          required={useManualHospital}
                        />
                      </div>

                      {/* Hospital address / street */}
                      <div className="flow-field" style={{ margin: 0 }}>
                        <label htmlFor="manualHospitalAddress" style={{ fontSize: "0.8rem", fontWeight: 600, color: "#334155", marginBottom: "0.35rem", display: "block" }}>
                          Hospital address / street
                        </label>
                        <input
                          id="manualHospitalAddress"
                          name="address"
                          value={manualHospital.address}
                          onChange={handleManualHospitalChange}
                          placeholder="e.g. Road No 2, Banjara Hills"
                        />
                      </div>

                      {/* Hospital location map */}
                      <LocationPickerMap
                        initialLat={manualHospital.lat}
                        initialLng={manualHospital.lng}
                        onLocationChange={({ lat, lng, city, state }) => {
                          setManualHospital((prev) => ({
                            ...prev,
                            lat,
                            lng,
                            city: city || prev.city,
                            state: state || prev.state,
                          }));
                        }}
                        label="Hospital Location (Map)"
                        height="220px"
                      />

                      {/* City + State */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                        <div className="flow-field" style={{ margin: 0 }}>
                          <label htmlFor="manualHospitalCity" style={{ fontSize: "0.8rem", fontWeight: 600, color: "#334155", marginBottom: "0.35rem", display: "block" }}>
                            Hospital city <span style={{ color: "#b91c1c" }}>*</span>
                          </label>
                          <input
                            id="manualHospitalCity"
                            name="city"
                            value={manualHospital.city}
                            onChange={handleManualHospitalChange}
                            placeholder="e.g. Hyderabad"
                            required={useManualHospital}
                          />
                        </div>
                        <div className="flow-field" style={{ margin: 0 }}>
                          <label htmlFor="manualHospitalState" style={{ fontSize: "0.8rem", fontWeight: 600, color: "#334155", marginBottom: "0.35rem", display: "block" }}>
                            Hospital state <span style={{ color: "#b91c1c" }}>*</span>
                          </label>
                          <input
                            id="manualHospitalState"
                            name="state"
                            value={manualHospital.state}
                            onChange={handleManualHospitalChange}
                            placeholder="e.g. Telangana"
                            required={useManualHospital}
                          />
                        </div>
                      </div>
                    </div>
                  )}
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
