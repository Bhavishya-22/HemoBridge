import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { normalizeUser } from "../../utils/roleAccess";
import { API_BASE } from "../../config/api";
import "../styles/signUp.css";

export default function SignupPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { login } = useAuth();

  // If redirected from login because account is unverified, prefill email and jump to OTP step
  const initialEmail = location.state?.email || "";
  const initialRequireOtp = Boolean(location.state?.requireOtp);

  const [step, setStep] = useState(initialRequireOtp ? "otp" : "form"); // "form" | "otp"
  const [form, setForm] = useState({
    fullName: "",
    username: "",
    email: initialEmail,
    password: "",
  });
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState(
    initialRequireOtp ? `A verification code was sent to ${initialEmail}. Please enter it below.` : ""
  );
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Countdown timer for Resend OTP button
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  // ── Step 1: Submit Registration Form ────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setInfoMessage("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.fullName,
          username: form.username,
          email: form.email,
          password: form.password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Registration failed. Please check your inputs.");
        return;
      }

      if (data.requireOtp) {
        setStep("otp");
        setInfoMessage(data.message || `We sent a 6-digit verification code to ${form.email}.`);
        setResendCooldown(60);
      } else if (data.user) {
        handleAuthSuccess(data.user);
      }
    } catch {
      setError("Unable to connect to server. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Verify Registration OTP ─────────────────────────────────────────
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError("");
    setInfoMessage("");

    if (!otp.trim() || otp.trim().length < 6) {
      setError("Please enter the complete 6-digit verification code.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/verify-registration-otp`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          otp: otp.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Invalid or expired OTP. Please try again.");
        return;
      }

      // Successful registration & activation -> automatically route to /profile to fill details
      login(normalizeUser(data.user));
      navigate("/profile");
    } catch {
      setError("Unable to connect to server to verify OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Resend Registration OTP ──────────────────────────────────────────────────
  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    setError("");
    setInfoMessage("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/resend-registration-otp`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Could not resend OTP. Please try again.");
      } else {
        setInfoMessage(data.message || `A fresh 6-digit code has been sent to ${form.email}.`);
        setResendCooldown(60);
      }
    } catch {
      setError("Failed to connect to server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* ── STEP 1: Registration Form ──────────────────────────────────────── */}
        {step === "form" && (
          <>
            <div className="auth-header">
              <h1 className="auth-title">Create an account</h1>
              <p className="auth-sub">Sign up to get started and connect with the network.</p>
            </div>

            {error && <div className="auth-error" role="alert">{error}</div>}

            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="field-group">
                <label htmlFor="fullName" className="field-label">Full name</label>
                <input
                  id="fullName"
                  name="fullName"
                  type="text"
                  className="field-input"
                  placeholder="e.g. Puneeth Sharma"
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
                  placeholder="e.g. puneeth123"
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

              <button type="submit" className="auth-btn" disabled={loading}>
                {loading ? <span className="auth-spinner"></span> : "Continue to verify"}
              </button>
            </form>

            <p className="auth-footer-text">
              Already have an account?{" "}
              <Link to="/login" className="auth-link">Log in</Link>
            </p>
          </>
        )}

        {/* ── STEP 2: OTP Verification ──────────────────────────────────────── */}
        {step === "otp" && (
          <div className="otp-verification-container">
            <div className="auth-header">
              <div className="otp-badge">Step 2 of 2</div>
              <h1 className="auth-title">Verify your email</h1>
              <p className="auth-sub">
                We sent a 6-digit registration code to <strong>{form.email}</strong>.
              </p>
            </div>

            {infoMessage && <div className="auth-info" role="status">{infoMessage}</div>}
            {error && <div className="auth-error" role="alert">{error}</div>}

            <form className="auth-form" onSubmit={handleVerifyOtp}>
              <div className="field-group">
                <label htmlFor="registration-otp" className="field-label">6-Digit Verification Code</label>
                <input
                  id="registration-otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  className="field-input otp-digit-input"
                  placeholder="123456"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  autoFocus
                  required
                />
              </div>

              <button type="submit" className="auth-btn" disabled={loading || otp.length < 6}>
                {loading ? <span className="auth-spinner"></span> : "Verify & Complete Registration"}
              </button>

              <div className="otp-resend-row">
                <button
                  type="button"
                  className="otp-resend-btn"
                  onClick={handleResendOtp}
                  disabled={resendCooldown > 0 || loading}
                >
                  {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}
                </button>

                <button
                  type="button"
                  className="otp-back-btn"
                  onClick={() => {
                    setStep("form");
                    setError("");
                    setInfoMessage("");
                  }}
                >
                  Change email or details
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* ── Side Hero Visual ─────────────────────────────────────────────────── */}
      <div className="auth-visual">
        <div className="auth-visual-blob"></div>
        <div className="auth-visual-content">
          <div className="auth-visual-drop">🩸</div>
          <div className="auth-visual-stat">500+ active donors</div>
          <div className="auth-visual-stat">300+ lives saved</div>
          <div className="auth-visual-stat">24 / 7 real-time support</div>
        </div>
      </div>
    </div>
  );
}