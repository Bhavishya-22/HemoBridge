import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/profile.css";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";
const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const ROLES = [
  { value: "donor", label: "Donor", icon: "💉" },
  { value: "receiver", label: "Receiver", icon: "🏥" },
  { value: "hospital", label: "Hospital", icon: "🏢" },
];

const EMPTY_FORM = {
  phoneNumber: "",
  bloodGroup: "",
  age: "",
  weight: "",
  role: "donor",
  city: "",
  state: "",
  diseases: "",
};

export default function ProfilePage() {
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY_FORM);
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
          setForm({
            phoneNumber: data.user.phoneNumber || "",
            bloodGroup: data.user.bloodGroup || "",
            age: data.user.age ?? "",
            weight: data.user.weight ?? "",
            role: data.user.role || "donor",
            city: data.user.location?.city || "",
            state: data.user.location?.state || "",
            diseases: data.user.diseases?.join(", ") || "",
          });
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

    const { phoneNumber, bloodGroup, age, weight, city, state } = form;
    if (!phoneNumber || !bloodGroup || !age || !weight || !city || !state) {
      setError("Please fill in all required fields.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/user/update-profile`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber,
          bloodGroup,
          age: Number(age),
          weight: Number(weight),
          role: form.role,
          location: { city, state },
          diseases: form.diseases
            ? form.diseases.split(",").map((d) => d.trim()).filter(Boolean)
            : [],
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Failed to save profile. Please try again.");
        return;
      }
      navigate("/home");
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