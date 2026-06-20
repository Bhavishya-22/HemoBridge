import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/profile.css";

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export default function ProfilePage() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    phoneNumber: "",
    bloodGroup: "",
    age: "",
    weight: "",
    role: "donor",
    city: "",
    state: "",
    diseases: "",
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!form.phoneNumber || !form.bloodGroup || !form.age || !form.weight || !form.city || !form.state) {
      setError("Please fill in all required fields.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("http://localhost:5000/user/update-profile", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: form.phoneNumber,
          bloodGroup: form.bloodGroup,
          age: Number(form.age),
          weight: Number(form.weight),
          role: form.role,
          location: {
            city: form.city,
            state: form.state,
          },
          diseases: form.diseases
            ? form.diseases.split(",").map((d) => d.trim()).filter(Boolean)
            : [],
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Failed to save profile. Please try again.");
      } else {
        navigate("/home");
      }
    } catch {
      setError("Unable to connect to server. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

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

        {error && <div className="profile-error">{error}</div>}

        <form className="profile-form" onSubmit={handleSubmit} noValidate>

          {/* Role selector — prominent, at the top */}
          <div className="field-group full">
            <label className="field-label">I am a</label>
            <div className="role-selector">
              {["donor", "receiver", "hospital"].map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`role-btn ${form.role === r ? "active" : ""}`}
                  onClick={() => setForm({ ...form, role: r })}
                >
                  <span className="role-icon">
                    {r === "donor" ? "💉" : r === "receiver" ? "🏥" : "🏢"}
                  </span>
                  <span className="role-label">
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </span>
                </button>
              ))}
            </div>
          </div>

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

          {/* Row: Age + Weight */}
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
                min={50}
                required
              />
            </div>
          </div>

          {/* Row: City + State */}
          <div className="form-row">
            <div className="field-group">
              <label htmlFor="city" className="field-label">
                City <span className="required">*</span>
              </label>
              <input
                id="city"
                name="city"
                type="text"
                className="field-input"
                placeholder="Hyderabad"
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
                placeholder="Telangana"
                value={form.state}
                onChange={handleChange}
                required
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

          <button type="submit" className="profile-btn" disabled={loading}>
            {loading ? <span className="profile-spinner"></span> : "Save profile →"}
          </button>
        </form>
      </div>
    </div>
  );
}