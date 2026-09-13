import { useEffect, useState } from "react";
import { API_BASE } from "../../config/api";
import { useAuth } from "../../context/AuthContext";
import { formatRequestStatus } from "../../utils/roleAccess";
import LocationPickerMap from "../../components/LocationPickerMap";
import "../styles/bloodFlow.css";

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
  const [form, setForm] = useState(EMPTY_FORM);
  const [coords, setCoords] = useState({ lat: null, lng: null, status: "idle" });
  const [myRequests, setMyRequests] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  const loadMyRequests = async () => {
    try {
      const res = await fetch(`${API_BASE}/requests/my-requests`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setMyRequests(data.requests || []);
      }
    } catch (err) {
      console.error("Failed to load requests:", err);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    // Acquire geolocation if supported
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      setCoords((prev) => ({ ...prev, status: "acquiring" }));
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCoords({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            status: "granted",
          });
        },
        (err) => {
          console.warn("Geolocation not granted:", err.message);
          setCoords((prev) => ({ ...prev, status: "denied" }));
        },
        { timeout: 8000 }
      );
    } else {
      setCoords((prev) => ({ ...prev, status: "unavailable" }));
    }

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
      } catch {
        /* ignore */
      }
    };
    prefill();
    loadMyRequests();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: name === "quantity" ? Number(value) : value,
    }));
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
      if (!res.ok) {
        setMessage({ type: "error", text: data.message || "Could not create request." });
        return;
      }
      setMessage({
        type: "success",
        text: data.message || "Request submitted. A hospital will verify it next.",
      });
      setForm((prev) => ({
        ...EMPTY_FORM,
        bloodGroup: prev.bloodGroup,
        city: prev.city,
        state: prev.state,
      }));
      await loadMyRequests();
    } catch {
      setMessage({ type: "error", text: "Unable to connect to server. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flow-page">
      <header className="flow-header">
        <h1 className="flow-title">Request blood</h1>
        <p className="flow-sub">
          Submit an urgent or planned request. After hospital approval, eligible donors near you are notified.
        </p>
      </header>

      <div className="flow-grid">
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
                <select
                  id="bloodGroup"
                  name="bloodGroup"
                  value={form.bloodGroup}
                  onChange={handleChange}
                  required
                >
                  <option value="">Select</option>
                  {BLOOD_GROUPS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flow-field">
                <label htmlFor="quantity">Units needed</label>
                <input
                  id="quantity"
                  name="quantity"
                  type="number"
                  min={1}
                  max={10}
                  value={form.quantity}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <div className="flow-field">
              <label htmlFor="emergencyLevel">Emergency level</label>
              <select
                id="emergencyLevel"
                name="emergencyLevel"
                value={form.emergencyLevel}
                onChange={handleChange}
              >
                {EMERGENCY_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </div>

            <LocationPickerMap
              initialLat={coords.lat}
              initialLng={coords.lng}
              onLocationChange={({ lat, lng, city, state }) => {
                setCoords({ lat, lng, status: "granted" });
                setForm((prev) => ({
                  ...prev,
                  city: city || prev.city,
                  state: state || prev.state,
                }));
              }}
              label="Patient Location (Map)"
              height="280px"
            />

            <div className="flow-row">
              <div className="flow-field">
                <label htmlFor="city">City</label>
                <input id="city" name="city" value={form.city} onChange={handleChange} required />
              </div>
              <div className="flow-field">
                <label htmlFor="state">State</label>
                <input id="state" name="state" value={form.state} onChange={handleChange} required />
              </div>
            </div>

            <div className="flow-geo-status" style={{ fontSize: "0.85rem", marginTop: "-0.5rem", marginBottom: "0.75rem", color: "#64748b" }}>
              {coords.status === "acquiring" && "🔵 Detecting your location..."}
              {coords.status === "granted" && `🟢 Exact Location Captured: ${coords.lat?.toFixed(4)}°, ${coords.lng?.toFixed(4)}°`}
              {coords.status === "denied" && "🟡 Location permission denied — pin on map will be used."}
              {coords.status === "unavailable" && "🟡 Geolocation unavailable — pin on map will be used."}
            </div>

            <div className="flow-field">
              <label htmlFor="hospitalName">Preferred hospital (optional)</label>
              <input
                id="hospitalName"
                name="hospitalName"
                value={form.hospitalName}
                onChange={handleChange}
                placeholder="Hospital name"
              />
            </div>

            <div className="flow-field">
              <label htmlFor="description">Additional details (optional)</label>
              <textarea
                id="description"
                name="description"
                value={form.description}
                onChange={handleChange}
                placeholder="Patient context, ward, contact person..."
              />
            </div>

            <button type="submit" className="flow-btn" disabled={submitting}>
              {submitting ? "Submitting..." : "Submit request"}
            </button>
          </form>
        </section>

        <section className="flow-card">
          <h2>Your requests</h2>
          {loadingList ? (
            <div className="flow-loading">
              <span className="flow-spinner" />
            </div>
          ) : myRequests.length === 0 ? (
            <div className="flow-empty">No requests yet. Submit your first request on the left.</div>
          ) : (
            <div className="flow-list">
              {myRequests.map((req) => {
                const matched = req.confirmedDonor || req.selectedDonor;
                return (
                  <article key={req._id} className="flow-request-item">
                    <div className="flow-request-top">
                      <span className="flow-badge blood">{req.bloodGroup}</span>
                      <span className={`flow-badge emergency-${req.emergencyLevel}`}>
                        {req.emergencyLevel}
                      </span>
                      <span className="flow-badge status">{formatRequestStatus(req.status)}</span>
                    </div>
                    <p className="flow-meta">
                      {req.quantity} unit{req.quantity > 1 ? "s" : ""} ·{" "}
                      {req.location?.city || "—"}, {req.location?.state || "—"}
                    </p>
                    {matched?.fullName && (
                      <p className="flow-meta">
                        Matched donor: <strong>{matched.fullName}</strong> (
                        {matched.bloodGroup})
                      </p>
                    )}
                    <p className="flow-meta">
                      Created {new Date(req.createdAt).toLocaleString()}
                    </p>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
