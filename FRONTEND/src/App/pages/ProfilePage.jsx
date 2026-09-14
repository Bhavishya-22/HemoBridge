import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { getRoleHomePath, normalizeUser } from "../../utils/roleAccess";
import LocationPickerMap from "../../components/LocationPickerMap";
import "../styles/profile.css";

import { API_BASE } from "../../config/api";
const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const ROLES = [
  { value: "donor", label: "Donor", icon: "💉" },
  { value: "receiver", label: "Receiver", icon: "🏥" },
  { value: "hospital", label: "Hospital", icon: "🏢" },
];

const EMPTY_FORM = {
  fullName: "",
  phoneNumber: "",
  bloodGroup: "",
  age: "",
  weight: "",
  height: "",
  role: "donor",
  city: "",
  state: "",
  diseases: "",
  hospitalName: "",
  registrationNumber: "",
  hospitalAddress: "",
  hospitalPhone: "",
};

export default function ProfilePage() {
  const navigate = useNavigate();
  const { login, updateUser, refreshUser } = useAuth();

  const [form, setForm] = useState(EMPTY_FORM);
  const [coords, setCoords] = useState({ lat: null, lng: null, status: "idle" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  useEffect(() => {
    const controller = new AbortController();

    const fetchProfile = async () => {
      try {
        const res = await fetch(`${API_BASE}/user/profile`, {
          method: "GET",
          credentials: "include",
          signal: controller.signal,
        });
        const data = await res.json();

        if (res.ok && data.user) {
          const u = data.user;
          setForm({
            fullName: u.fullName || "",
            phoneNumber: u.phoneNumber || "",
            bloodGroup: u.bloodGroup || "",
            age: u.age ?? "",
            weight: u.weight ?? "",
            height: u.height ?? "",
            role: u.role || "donor",
            city: u.location?.city || "",
            state: u.location?.state || "",
            diseases: u.diseases?.join(", ") || "",
            hospitalName: u.hospitalName || "",
            registrationNumber: u.registrationNumber || "",
            hospitalAddress: u.hospitalAddress || "",
            hospitalPhone: u.hospitalPhone || "",
          });

          // Extract coordinates from user location if available
          let initialLat = null;
          let initialLng = null;
          const loc = u.location;
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
          } else if (typeof navigator !== "undefined" && navigator.geolocation) {
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
                console.warn("Geolocation:", err.message);
                setCoords((prev) => ({ ...prev, status: "denied" }));
              },
              { timeout: 8000 }
            );
          } else {
            setCoords((prev) => ({ ...prev, status: "unavailable" }));
          }
        }
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Error fetching profile:", err);
        }
      } finally {
        setInitializing(false);
      }
    };

    fetchProfile();
    return () => controller.abort();
  }, []);


  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!form.fullName || !form.fullName.trim()) {
      setError("Please enter your full name.");
      return;
    }

    const isHospital = form.role === "hospital";

    if (isHospital) {
      const { phoneNumber, hospitalName, registrationNumber, hospitalAddress, hospitalPhone } = form;
      if (!phoneNumber || !hospitalName || !registrationNumber || !hospitalAddress || !hospitalPhone) {
        setError("Please fill in all hospital details.");
        return;
      }
    } else {
      const { phoneNumber, bloodGroup, age, weight, city, state } = form;
      if (!phoneNumber || !bloodGroup || !age || !weight || !city || !state) {
        setError("Please fill in all required fields.");
        return;
      }
    }

    setLoading(true);
    try {
      const locationPayload = {
        city: form.city,
        state: form.state,
        ...(coords.lat != null && coords.lng != null
          ? { coordinates: { lat: coords.lat, lng: coords.lng } }
          : {}),
      };

      let bodyPayload = {};
      if (isHospital) {
        bodyPayload = {
          fullName: form.fullName.trim(),
          role: "hospital",
          phoneNumber: form.phoneNumber,
          hospitalName: form.hospitalName,
          registrationNumber: form.registrationNumber,
          hospitalAddress: form.hospitalAddress,
          hospitalPhone: form.hospitalPhone,
          location: locationPayload,
        };
      } else {
        bodyPayload = {
          fullName: form.fullName.trim(),
          role: form.role,
          phoneNumber: form.phoneNumber,
          bloodGroup: form.bloodGroup,
          age: Number(form.age),
          weight: Number(form.weight),
          height: form.height ? Number(form.height) : undefined,
          location: locationPayload,
          diseases: form.diseases
            ? form.diseases.split(",").map((d) => d.trim()).filter(Boolean)
            : [],
        };
      }

      const res = await fetch(`${API_BASE}/user/update-profile`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Failed to save profile. Please try again.");
        return;
      }
      const updatedUser = normalizeUser(data.user);
      login(updatedUser);
      if (typeof updateUser === "function") updateUser(updatedUser);
      if (typeof refreshUser === "function") await refreshUser();
      navigate(getRoleHomePath(updatedUser?.role));
    } catch {
      setError("Unable to connect to server. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  if (initializing) {
    return (
      <div className="profile-page">
        <div className="profile-card profile-loading">
          <span className="profile-spinner"></span>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <div className="profile-card">
        {/* Brand */}
        <div className="profile-brand">
          <span className="profile-brand-icon">🩸</span>
          <span className="profile-brand-name">Blood<span>Bank</span></span>
        </div>

        {/* Header */}
        <div className="profile-header">
          <h1 className="profile-title">Complete your profile</h1>
          <p className="profile-sub">
            This helps us match you with the right donors or patients. Takes less than a minute.
          </p>
        </div>

        {/* Progress indicator */}
        <div className="profile-steps">
          <div className="step done">1 Account</div>
          <div className="step-line"></div>
          <div className="step active">2 Profile</div>
          <div className="step-line"></div>
          <div className="step">3 Done</div>
        </div>

        {error && (
          <div className="profile-error" role="alert">
            {error}
          </div>
        )}

        <form className="profile-form" onSubmit={handleSubmit} noValidate>
          {/* Role selector */}
          <div className="field-group full">
            <label className="field-label">I am a</label>
            <div className="role-selector">
              {ROLES.map(({ value, label, icon }) => (
                <button
                  key={value}
                  type="button"
                  className={`role-btn ${form.role === value ? "active" : ""}`}
                  onClick={() => setForm((prev) => ({ ...prev, role: value }))}
                  aria-pressed={form.role === value}
                >
                  <span className="role-icon">{icon}</span>
                  <span className="role-label">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Full Name */}
          <div className="field-group full">
            <label htmlFor="fullName" className="field-label">
              Full Name <span className="required">*</span>
            </label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              className="field-input"
              placeholder="e.g. Puneeth Sharma"
              value={form.fullName}
              onChange={handleChange}
              required
            />
          </div>

          {/* Hospital-Specific Fields */}
          {form.role === "hospital" ? (
            <>
              <div className="field-group full">
                <label htmlFor="phoneNumber" className="field-label">
                  Contact Phone Number <span className="required">*</span>
                </label>
                <input
                  id="phoneNumber"
                  name="phoneNumber"
                  type="tel"
                  className="field-input"
                  placeholder="+91 98765 43210"
                  value={form.phoneNumber}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-row">
                <div className="field-group">
                  <label htmlFor="hospitalName" className="field-label">
                    Hospital Name <span className="required">*</span>
                  </label>
                  <input
                    id="hospitalName"
                    name="hospitalName"
                    type="text"
                    className="field-input"
                    placeholder="e.g. Apollo Hospitals"
                    value={form.hospitalName}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="field-group">
                  <label htmlFor="registrationNumber" className="field-label">
                    Registration Number <span className="required">*</span>
                  </label>
                  <input
                    id="registrationNumber"
                    name="registrationNumber"
                    type="text"
                    className="field-input"
                    placeholder="e.g. HOSP-12345"
                    value={form.registrationNumber}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              <div className="field-group full">
                <label htmlFor="hospitalAddress" className="field-label">
                  Hospital Address <span className="required">*</span>
                </label>
                <input
                  id="hospitalAddress"
                  name="hospitalAddress"
                  type="text"
                  className="field-input"
                  placeholder="e.g. Road No 2, Banjara Hills, Hyderabad"
                  value={form.hospitalAddress}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="field-group full">
                <label htmlFor="hospitalPhone" className="field-label">
                  Official Hospital Phone / Helpdesk <span className="required">*</span>
                </label>
                <input
                  id="hospitalPhone"
                  name="hospitalPhone"
                  type="tel"
                  className="field-input"
                  placeholder="e.g. 040-23456789"
                  value={form.hospitalPhone}
                  onChange={handleChange}
                  required
                />
              </div>
            </>
          ) : (
            /* Donor and Receiver Fields */
            <>
              {/* Row: Blood Group + Phone */}
              <div className="form-row">
                <div className="field-group">
                  <label htmlFor="bloodGroup" className="field-label">
                    Blood group <span className="required">*</span>
                  </label>
                  <select
                    id="bloodGroup"
                    name="bloodGroup"
                    className="field-input"
                    value={form.bloodGroup}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Select</option>
                    {BLOOD_GROUPS.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>

                <div className="field-group">
                  <label htmlFor="phoneNumber" className="field-label">
                    Phone number <span className="required">*</span>
                  </label>
                  <input
                    id="phoneNumber"
                    name="phoneNumber"
                    type="tel"
                    className="field-input"
                    placeholder="+91 98765 43210"
                    value={form.phoneNumber}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              {/* Row: Age + Weight + Height */}
              <div className="form-row">
                <div className="field-group">
                  <label htmlFor="age" className="field-label">
                    Age <span className="required">*</span>
                  </label>
                  <input
                    id="age"
                    name="age"
                    type="number"
                    className="field-input"
                    placeholder="e.g. 22"
                    value={form.age}
                    onChange={handleChange}
                    min={18}
                    max={65}
                    required
                  />
                </div>

                <div className="field-group">
                  <label htmlFor="weight" className="field-label">
                    Weight (kg) <span className="required">*</span>
                  </label>
                  <input
                    id="weight"
                    name="weight"
                    type="number"
                    className="field-input"
                    placeholder="e.g. 65"
                    value={form.weight}
                    onChange={handleChange}
                    min={45}
                    required
                  />
                </div>

                <div className="field-group">
                  <label htmlFor="height" className="field-label">
                    Height (cm)
                  </label>
                  <input
                    id="height"
                    name="height"
                    type="number"
                    className="field-input"
                    placeholder="e.g. 175"
                    value={form.height}
                    onChange={handleChange}
                    min={50}
                    max={250}
                  />
                </div>
              </div>

              {/* Diseases — optional */}
              <div className="field-group full">
                <label htmlFor="diseases" className="field-label">
                  Any medical conditions{" "}
                  <span className="field-optional">(optional)</span>
                </label>
                <input
                  id="diseases"
                  name="diseases"
                  type="text"
                  className="field-input"
                  placeholder="e.g. Diabetes, Hypertension — comma separated"
                  value={form.diseases}
                  onChange={handleChange}
                />
                <span className="field-hint">
                  Leave blank if none. Separate multiple conditions with a comma.
                </span>
              </div>
            </>
          )}

          {/* Location & Map Section (Available for all roles) */}
          <div style={{ marginTop: "1rem", marginBottom: "0.5rem" }}>
            <div style={{ marginBottom: "0.5rem" }}>
              <label className="field-label" style={{ margin: 0 }}>
                Location (Map Pin & Coordinates) <span className="required">*</span>
              </label>
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
              label="Location on Map"
              height="240px"
            />

            {/* Row: City + State */}
            <div className="form-row" style={{ marginTop: "0.75rem" }}>
              <div className="field-group">
                <label htmlFor="city" className="field-label">
                  City <span className="required">*</span>
                </label>
                <input
                  id="city"
                  name="city"
                  type="text"
                  className="field-input"
                  placeholder="e.g. Hyderabad"
                  value={form.city}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="field-group">
                <label htmlFor="state" className="field-label">
                  State <span className="required">*</span>
                </label>
                <input
                  id="state"
                  name="state"
                  type="text"
                  className="field-input"
                  placeholder="e.g. Telangana"
                  value={form.state}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <div style={{ fontSize: "0.85rem", marginTop: "-0.25rem", marginBottom: "0.75rem", color: "#64748b" }}>
              {coords.status === "acquiring" && "🔵 Detecting your location..."}
              {coords.status === "granted" && `🟢 Exact Coordinates Captured: ${coords.lat?.toFixed(4)}°, ${coords.lng?.toFixed(4)}°`}
              {coords.status === "denied" && "🟡 Location access denied — map pin will be used."}
              {coords.status === "unavailable" && "🟡 Geolocation unavailable — map pin will be used."}
            </div>
          </div>

          <button type="submit" className="profile-btn" disabled={loading}>
            {loading ? <span className="profile-spinner"></span> : "Save profile →"}
          </button>
        </form>
      </div>
    </div>
  );
}