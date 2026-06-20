import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/login.css";

export default function LoginPage() {
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("http://localhost:3000/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.username,
          password: form.password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Invalid username or password.");
      } else {
        navigate(data.user.profileCompleted ? "/home" : "/profile");
      }
    } catch {
      setError("Unable to connect to server. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-visual">
        <div className="auth-visual-blob"></div>
        <div className="auth-visual-content">
          <div className="auth-visual-drop">🩸</div>
          <p className="auth-visual-tagline">Every drop counts,<br />every donor matters.</p>
        </div>
      </div>

      <div className="auth-card">
        <div className="auth-brand">
          <span className="auth-brand-icon">🩸</span>
          <span className="auth-brand-name">Blood<span>Bank</span></span>
        </div>

        <div className="auth-header">
          <h1 className="auth-title">Welcome back</h1>
          <p className="auth-sub">Log in to your account to continue.</p>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="field-group">
            <label htmlFor="username" className="field-label">Username</label>
            <input
              id="username"
              name="username"
              type="text"
              className="field-input"
              placeholder="thanmayee123"
              value={form.username}
              onChange={handleChange}
              required
              autoComplete="username"
            />
          </div>

          <div className="field-group">
            <div className="field-label-row">
              <label htmlFor="password" className="field-label">Password</label>
              <a href="/forgot-password" className="auth-link forgot">Forgot password?</a>
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
          <a href="/signup" className="auth-link">Sign up</a>
        </p>
      </div>
    </div>
  );
}