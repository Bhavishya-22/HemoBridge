import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { getRoleHomePath, normalizeUser } from "../../utils/roleAccess";
import { API_BASE } from "../../config/api";
import "../styles/signup.css";

export default function SignupPage() {
  const [form, setForm] = useState({ fullName: "", username: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
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
              placeholder="YOUR FULL NAME"
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