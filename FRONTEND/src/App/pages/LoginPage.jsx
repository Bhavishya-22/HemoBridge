import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { getRoleHomePath, normalizeUser } from "../../utils/roleAccess";
import GoogleAuthButton from "../components/GoogleAuthButton";
import "../styles/login.css";

import { API_BASE } from "../../config/api";

export default function LoginPage() {
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!form.username.trim() || !form.password) {
      setError("Please enter both username and password.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.username.trim(),
          password: form.password,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Invalid username or password.");
        return;
      }

      handleAuthSuccess(data.user);
    } catch {
      setError("Unable to connect to server. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  const handleAuthSuccess = (userData) => {
    login(normalizeUser(userData));
    const role = userData.role;
    if (role === "admin" || role === "hospital") {
      navigate(getRoleHomePath(role));
    } else {
      navigate(userData.profileCompleted ? getRoleHomePath(role) : "/profile");
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-visual">
        <div className="auth-visual-blob"></div>
        <div className="auth-visual-content">
          <div className="auth-visual-drop">🩸</div>
          <p className="auth-visual-tagline">
            Every drop counts,
            <br />
            every donor matters.
          </p>
        </div>
      </div>

      <div className="auth-card">
        <div className="auth-header">
          <h1 className="auth-title">Welcome back</h1>
          <p className="auth-sub">Log in to your account to continue.</p>
        </div>

        {error && (
          <div className="auth-error" role="alert">
            {error}
          </div>
        )}

        {/* ── Professional Google Sign-In Button (Always Visible) ── */}
        <GoogleAuthButton
          text="Continue with Google"
          containerId="google-signin-btn-login"
          onSuccess={handleAuthSuccess}
          onError={(msg) => setError(msg)}
        />

        {/* ── Divider ── */}
        <div className="auth-divider">
          <span>or continue with credentials</span>
        </div>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="field-group">
            <label htmlFor="username" className="field-label">
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              className="field-input"
              placeholder="USERNAME"
              value={form.username}
              onChange={handleChange}
              required
              autoComplete="username"
              autoFocus
            />
          </div>

          <div className="field-group">
            <div className="field-label-row">
              <label htmlFor="password" className="field-label">
                Password
              </label>
              <Link to="/forgot-password" className="auth-link forgot">
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              name="password"
              type="password"
              className="field-input"
              placeholder="Enter your password"
              value={form.password}
              onChange={handleChange}
              required
              autoComplete="current-password"
            />
          </div>

          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? <span className="auth-spinner"></span> : "Log in"}
          </button>
        </form>

        <p className="auth-footer-text">
          Don't have an account?{" "}
          <Link to="/signup" className="auth-link">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}