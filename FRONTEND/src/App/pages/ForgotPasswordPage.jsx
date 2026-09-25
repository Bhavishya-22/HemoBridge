import { useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../../config/api";
import "../styles/forgotPassword.css";

const STEPS = ["Enter email", "Verify OTP", "Done"];

export default function ForgotPasswordPage() {
  const [step, setStep] = useState(0); // 0 = email, 1 = OTP+password, 2 = success
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSendOTP = async (e) => {
    e.preventDefault();
    setError("");
    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Something went wrong.");
      } else {
        setMessage(data.message);
        setStep(1);
      }
    } catch {
      setError("Unable to connect to server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError("");

    if (!otp.trim()) {
      setError("Please enter the OTP sent to your email.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), otp: otp.trim(), newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Reset failed. Please try again.");
      } else {
        setStep(2);
      }
    } catch {
      setError("Unable to connect to server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page fp-page">
      <div className="auth-visual">
        <div className="auth-visual-blob"></div>
        <div className="auth-visual-content">
          <div className="auth-visual-drop">🔑</div>
          <p className="auth-visual-tagline">
            Don't worry,
            <br />
            we've got you covered.
          </p>
        </div>
      </div>

      <div className="auth-card">
        {/* Step indicator */}
        <div className="fp-steps">
          {STEPS.map((label, i) => (
            <div
              key={label}
              className={`fp-step ${i < step ? "fp-step-done" : ""} ${i === step ? "fp-step-active" : ""}`}
            >
              <div className="fp-step-dot">
                {i < step ? "✓" : i + 1}
              </div>
              <span className="fp-step-label">{label}</span>
            </div>
          ))}
        </div>

        {/* Step 0 — Enter email */}
        {step === 0 && (
          <>
            <div className="auth-header">
              <h1 className="auth-title">Forgot password?</h1>
              <p className="auth-sub">
                Enter the email associated with your account. We'll send a 6-digit OTP.
              </p>
            </div>

            {error && <div className="auth-error" role="alert">{error}</div>}

            <form className="auth-form" onSubmit={handleSendOTP} noValidate>
              <div className="field-group">
                <label htmlFor="fp-email" className="field-label">
                  Email address
                </label>
                <input
                  id="fp-email"
                  type="email"
                  className="field-input"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>

              <button type="submit" className="auth-btn" disabled={loading}>
                {loading ? <span className="auth-spinner"></span> : "Send OTP"}
              </button>
            </form>

            <p className="auth-footer-text">
              Remember your password?{" "}
              <Link to="/login" className="auth-link">
                Log in
              </Link>
            </p>
          </>
        )}

        {/* Step 1 — OTP + new password */}
        {step === 1 && (
          <>
            <div className="auth-header">
              <h1 className="auth-title">Enter OTP</h1>
              <p className="auth-sub">
                We've sent a 6-digit code to <strong>{email}</strong>. Enter it below along with your new password.
              </p>
              <div style={{ marginTop: "8px", padding: "8px 12px", background: "#fff7ed", borderRadius: "8px", border: "1px solid #fed7aa", fontSize: "0.82rem", color: "#9a3412" }}>
                📩 <strong>Note:</strong> Please check your <strong>Spam / Junk</strong> folder as well in case the email was filtered there.
              </div>
            </div>

            {error && <div className="auth-error" role="alert">{error}</div>}
            {message && <div className="fp-info">{message}</div>}

            <form className="auth-form" onSubmit={handleResetPassword} noValidate>
              <div className="field-group">
                <label htmlFor="fp-otp" className="field-label">
                  OTP Code
                </label>
                <input
                  id="fp-otp"
                  type="text"
                  className="field-input fp-otp-input"
                  placeholder="• • • • • •"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={6}
                  inputMode="numeric"
                />
              </div>

              <div className="field-group">
                <label htmlFor="fp-newpw" className="field-label">
                  New password
                </label>
                <input
                  id="fp-newpw"
                  type="password"
                  className="field-input"
                  placeholder="Min. 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  minLength={8}
                />
              </div>

              <div className="field-group">
                <label htmlFor="fp-confirm" className="field-label">
                  Confirm password
                </label>
                <input
                  id="fp-confirm"
                  type="password"
                  className="field-input"
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>

              <button type="submit" className="auth-btn" disabled={loading}>
                {loading ? <span className="auth-spinner"></span> : "Reset password"}
              </button>
            </form>

            <button
              type="button"
              className="fp-resend-btn"
              onClick={handleSendOTP}
              disabled={loading}
            >
              Didn't receive the code? Resend OTP
            </button>
          </>
        )}

        {/* Step 2 — Success */}
        {step === 2 && (
          <div className="fp-success">
            <div className="fp-success-icon">✅</div>
            <h2 className="auth-title">Password reset!</h2>
            <p className="auth-sub">
              Your password has been changed successfully. You can now log in with your new password.
            </p>
            <Link to="/login" className="auth-btn fp-login-link">
              Go to Login
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
