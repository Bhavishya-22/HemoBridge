import { useState } from "react";
import FormSection from "../components/Form";
import "../styles/requestbloodpage.css";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";
const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

// Matches bloodRequestSchema.emergencyLevel enum exactly
const EMERGENCY_LEVELS = [
  { value: "low", label: "Low - within a few days" },
  { value: "medium", label: "Medium - within 24-48 hours" },
  { value: "high", label: "High - within hours" },
  { value: "critical", label: "Critical - immediate" },
];

const STATUS_LABELS = {
  pending_hospital_approval: "Waiting for Hospital Approval",
};

const initialForm = {
  bloodGroup: "",
  quantity: "",
  emergencyLevel: "medium",
  city: "",
  state: "",
  hospitalName: "",
  description: "",
};

export default function RequestBloodPage() {
  const [form, setForm] = useState(initialForm);
  const [coords, setCoords] = useState(null); // { lat, lng } - optional
  const [locating, setLocating] = useState(false);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState("idle"); // idle | submitting | submitted | error
  const [resultStatus, setResultStatus] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  const updateField = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleUseLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => setLocating(false),
      { timeout: 8000 }
    );
  };

  const validate = () => {
    const next = {};
    if (!form.bloodGroup) next.bloodGroup = "Select a blood group";
    if (!form.quantity) next.quantity = "Units required";
    else if (form.quantity < 1 || form.quantity > 10)
      next.quantity = "Quantity must be between 1 and 10";
    if (!form.emergencyLevel) next.emergencyLevel = "Select an emergency level";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setStatus("submitting");
    setErrorMessage("");

    const payload = {
      bloodGroup: form.bloodGroup,
      quantity: Number(form.quantity),
      emergencyLevel: form.emergencyLevel,
      hospitalName: form.hospitalName || undefined,
      description: form.description || undefined,
      location: {
        city: form.city || undefined,
        state: form.state || undefined,
        ...(coords
          ? { coordinates: { type: "Point", coordinates: [coords.lng, coords.lat] } }
          : {}),
      },
    };

    try {
      // NOTE: adjust the base path below to match how requestRouter is
      // mounted in app.js (e.g. app.use("/api", requestRouter) would make
      // this endpoint "/api/requests/create").
      const res = await fetch(`${API_BASE}/requests/create`, {
        method: "POST",
        credentials: "include", // sends accessToken cookie, same as ProfilePage
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Request failed");
      }

      setResultStatus(data.data?.status || "pending_hospital_approval");
      setStatus("submitted");
    } catch (err) {
      setErrorMessage(err.message || "Something went wrong. Please try again.");
      setStatus("error");
    }
  };

  if (status === "submitted") {
    return (
      <div className="request-page">
        <div className="request-success">
          <div className="request-success__icon">✓</div>
          <h1>Request submitted</h1>
          <p>
            Your request for <strong>{form.quantity} unit(s)</strong> of{" "}
            <strong>{form.bloodGroup}</strong> blood has been sent for review.
          </p>
          <div className="status-pill status-pill--waiting">
            {STATUS_LABELS[resultStatus] || resultStatus}
          </div>
          <p className="request-success__note">
            A hospital will review your request. Once approved, we'll start
            searching for compatible donors nearby.
          </p>
          <button
            className="btn btn--outline"
            onClick={() => {
              setForm(initialForm);
              setCoords(null);
              setStatus("idle");
            }}
          >
            Submit another request
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="request-page">
      <header className="request-page__header">
        <p className="eyebrow">Request Blood</p>
        <h1>Tell us what's needed, and where</h1>
        <p className="request-page__subtitle">
          Fill in the details below. A hospital will review your request
          before we start notifying compatible donors nearby.
        </p>
      </header>

      <form className="request-form" onSubmit={handleSubmit} noValidate>
        <FormSection
          step={1}
          title="Blood needed"
          description="What blood group and how many units?"
        >
          <div className="field-grid">
            <div className="field">
              <label className="field-label">Blood group *</label>
              <select value={form.bloodGroup} onChange={updateField("bloodGroup")}>
                <option value="">Select group</option>
                {BLOOD_GROUPS.map((bg) => (
                  <option key={bg} value={bg}>
                    {bg}
                  </option>
                ))}
              </select>
              {errors.bloodGroup && <p className="field-error">{errors.bloodGroup}</p>}
            </div>

            <div className="field">
              <label className="field-label">Units required *</label>
              <input
                type="number"
                min="1"
                max="10"
                value={form.quantity}
                onChange={updateField("quantity")}
                placeholder="1-10"
              />
              {errors.quantity && <p className="field-error">{errors.quantity}</p>}
            </div>

            <div className="field field--span2">
              <label className="field-label">Emergency level *</label>
              <select
                value={form.emergencyLevel}
                onChange={updateField("emergencyLevel")}
              >
                {EMERGENCY_LEVELS.map((lvl) => (
                  <option key={lvl.value} value={lvl.value}>
                    {lvl.label}
                  </option>
                ))}
              </select>
              {errors.emergencyLevel && (
                <p className="field-error">{errors.emergencyLevel}</p>
              )}
            </div>
          </div>
        </FormSection>

        <FormSection
          step={2}
          title="Location & hospital"
          description="Where should donors and the hospital be matched from?"
        >
          <div className="field-grid">
            <div className="field">
              <label className="field-label">City</label>
              <input
                type="text"
                value={form.city}
                onChange={updateField("city")}
                placeholder="City"
              />
            </div>

            <div className="field">
              <label className="field-label">State</label>
              <input
                type="text"
                value={form.state}
                onChange={updateField("state")}
                placeholder="State"
              />
            </div>

            <div className="field field--span2">
              <button
                type="button"
                className="btn btn--outline btn--small"
                onClick={handleUseLocation}
                disabled={locating}
              >
                {locating
                  ? "Getting location..."
                  : coords
                  ? "Location captured ✓"
                  : "Use my current location"}
              </button>
              <p className="field-hint" style={{ marginTop: 6 }}>
                Optional - helps match the closest donors more precisely.
              </p>
            </div>

            <div className="field field--span2">
              <label className="field-label">Hospital name</label>
              <input
                type="text"
                value={form.hospitalName}
                onChange={updateField("hospitalName")}
                placeholder="Hospital name (optional)"
              />
            </div>
          </div>
        </FormSection>

        <FormSection
          step={3}
          title="Additional details"
          description="Anything that helps the hospital review this faster."
        >
          <div className="field-grid">
            <div className="field field--span2">
              <label className="field-label">Description</label>
              <textarea
                rows={4}
                value={form.description}
                onChange={updateField("description")}
                placeholder="Briefly describe the situation (optional)"
              />
            </div>
          </div>
        </FormSection>

        {status === "error" && (
          <p className="form-error-banner">{errorMessage}</p>
        )}

        <div className="request-form__actions">
          <button
            type="submit"
            className="btn btn--primary"
            disabled={status === "submitting"}
          >
            {status === "submitting" ? "Submitting..." : "Submit request"}
          </button>
        </div>
      </form>
    </div>
  );
}