import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { getRoleHomePath, normalizeUser } from "../../utils/roleAccess";
import { API_BASE } from "../../config/api";
import "../styles/signup.css";

export default function SignupPage() {
  const [form, setForm] = useState({ fullName: "", username: "", email: "", password: "" });
  const [location, setLocation] = useState({ city: "", state: "", lat: null, lng: null });
  const [geoStatus, setGeoStatus] = useState("idle"); // idle | acquiring | granted | denied | unavailable
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const handleLocationChange = (e) =>
    setLocation((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      setGeoStatus("unavailable");
      return;
    }
    setGeoStatus("acquiring");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setLocation((prev) => ({ ...prev, lat, lng }));
        setGeoStatus("granted");
        // Reverse-geocode via production backend proxy with graceful fallback
        try {
          let res = await fetch(`${API_BASE}/geocode/reverse?lat=${lat}&lng=${lng}`).catch(() => null);
          if (res && res.ok) {
            const data = await res.json();
            if (data.city || data.state) {
              setLocation((prev) => ({ ...prev, city: data.city || "", state: data.state || "" }));
              return;
            }
          }

          // Direct fallback
          res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
            { headers: { "Accept-Language": "en" } }
          );
          if (res.ok) {
            const data = await res.json();
            const city =
              data.address?.city ||
              data.address?.town ||
              data.address?.village ||
              data.address?.county ||
              "";
            const state = data.address?.state || "";
            setLocation((prev) => ({ ...prev, city, state }));
          }
        } catch {
          /* geocode failed — user can type manually */
        }
      },
      () => setGeoStatus("denied"),
      { timeout: 8000 }
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const body = {
        fullName: form.fullName,
        username: form.username,
        email: form.email,
        password: form.password,
      };
      // Attach location only if at least city/state filled
      if (location.city || location.state) {
        body.location = {
          city: location.city,
          state: location.state,
          ...(location.lat != null && location.lng != null
            ? { coordinates: { lat: location.lat, lng: location.lng } }
            : {}),
        };
      }
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Registration failed. Please try again.");
      } else {
        login(normalizeUser(data.user));
        navigate(data.user.profileCompleted ? getRoleHomePath(data.user.role) : "/profile");
      }
    } catch {
      setError("Unable to connect to server. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  const geoStatusMsg = {
    acquiring: { icon: "🔵", text: "Detecting your location…" },
    granted: { icon: "🟢", text: `Location captured: ${location.lat?.toFixed(4)}°, ${location.lng?.toFixed(4)}°` },
    denied: { icon: "🟡", text: "Location access denied — enter city & state manually." },
    unavailable: { icon: "🟡", text: "Geolocation unavailable — enter manually." },
  }[geoStatus] || null;

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <h1 className="auth-title">Create an account</h1>
          <p className="auth-sub">Join thousands of donors making a difference.</p>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="field-group">
            <label htmlFor="fullName" className="field-label">Full name</label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              className="field-input"
              placeholder="Your full name"
              value={form.fullName}
              onChange={handleChange}
              required
              autoComplete="name"
            />
          </div>

          <div className="field-group">
            <label htmlFor="username" className="field-label">Username</label>
            <input
              id="username"
              name="username"
              type="text"
              className="field-input"
              placeholder="username"
              value={form.username}
              onChange={handleChange}
              required
              autoComplete="username"
            />
          </div>

          <div className="field-group">
            <label htmlFor="email" className="field-label">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              className="field-input"
              placeholder="you@example.com"
              value={form.email}
              onChange={handleChange}
              required
              autoComplete="email"
            />
          </div>

          <div className="field-group">
            <label htmlFor="password" className="field-label">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              className="field-input"
              placeholder="Min. 8 characters"
              value={form.password}
              onChange={handleChange}
              required
              autoComplete="new-password"
              minLength={8}
            />
          </div>

          {/* ── Location Section ── */}
          <div className="field-group">
            <label className="field-label">
              Your location{" "}
              <span style={{ fontWeight: 400, color: "#94a3b8", fontSize: "0.78rem" }}>
                (recommended — helps match you with nearby donors/hospitals)
              </span>
            </label>

            {/* Detect button */}
            <button
              type="button"
              id="detect-location-btn"
              className="signup-detect-btn"
              onClick={handleDetectLocation}
              disabled={geoStatus === "acquiring"}
            >
              {geoStatus === "acquiring" ? (
                <><span className="auth-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Detecting…</>
              ) : (
                <><span>📍</span> Detect my location</>
              )}
            </button>

            {/* Geo status message */}
            {geoStatusMsg && (
              <p style={{ fontSize: "0.78rem", color: "#64748b", marginTop: "0.25rem", lineHeight: 1.4 }}>
                {geoStatusMsg.icon} {geoStatusMsg.text}
              </p>
            )}

            {/* City + State row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.65rem", marginTop: "0.4rem" }}>
              <div>
                <label htmlFor="signup-city" className="field-label" style={{ marginBottom: "0.3rem", display: "block" }}>
                  City
                </label>
                <input
                  id="signup-city"
                  name="city"
                  type="text"
                  className="field-input"
                  placeholder="e.g. Hyderabad"
                  value={location.city}
                  onChange={handleLocationChange}
                  autoComplete="address-level2"
                />
              </div>
              <div>
                <label htmlFor="signup-state" className="field-label" style={{ marginBottom: "0.3rem", display: "block" }}>
                  State
                </label>
                <input
                  id="signup-state"
                  name="state"
                  type="text"
                  className="field-input"
                  placeholder="e.g. Telangana"
                  value={location.state}
                  onChange={handleLocationChange}
                  autoComplete="address-level1"
                />
              </div>
            </div>
          </div>

          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? <span className="auth-spinner"></span> : "Sign up"}
          </button>
        </form>

        <p className="auth-footer-text">
          Already have an account?{" "}
          <a href="/login" className="auth-link">Log in</a>
        </p>
      </div>

      <div className="auth-visual">
        <div className="auth-visual-blob"></div>
        <div className="auth-visual-content">
          <div className="auth-visual-drop">🩸</div>
          <div className="auth-visual-stat">500+ active donors</div>
          <div className="auth-visual-stat">300+ lives saved</div>
          <div className="auth-visual-stat">24 / 7 support</div>
        </div>
      </div>
    </div>
  );
}