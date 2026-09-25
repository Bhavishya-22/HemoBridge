import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { API_BASE } from "../../config/api";
import "../styles/hero.css";

export default function Hero() {
  const navigate = useNavigate();
  const { user, isLoggedIn } = useAuth();
  const [totalDonors, setTotalDonors] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/stats`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.success) setTotalDonors(data.totalDonors);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRequestBlood = () => {
    if (!isLoggedIn) { navigate("/login"); return; }
    if (user?.role === "receiver") { navigate("/request"); return; }
    navigate("/signup");
  };

  const handleBecomeDonor = () => {
    if (!isLoggedIn) { navigate("/login"); return; }
    if (user?.role === "donor") { navigate("/donate"); return; }
    navigate("/signup");
  };

  return (
    <section className="hero">
      <div className="hero-inner">
        <div>
          <div className="hero-eyebrow">
            <span className="hero-eyebrow-dot" />
            Community Blood Connection Platform
          </div>
          <h1 className="hero-h1">
            Every drop counts,<br />every <em>donor</em> matters
          </h1>
          <p className="hero-sub">
            Connect blood donors with patients in need. Request blood, donate blood, and help save lives — all in one place.
          </p>
          <div className="hero-ctas">
            <button className="btn-hero-primary" onClick={handleRequestBlood}>
              <span>🩸 Request Blood Now</span>
            </button>
            <button className="btn-hero-secondary" onClick={handleBecomeDonor}>
              <span>❤️ Become a Donor</span>
            </button>
          </div>
          <div className="hero-trust-bar">
            <span className="trust-item">✓ 100% Free Service</span>
            <span className="trust-dot">•</span>
            <span className="trust-item">⚡ Instant Match</span>
            <span className="trust-dot">•</span>
            <span className="trust-item">🔒 Verified Donors</span>
          </div>
        </div>
        <div className="hero-visual">
          <div className="hero-blob-aura"></div>
          <div className="hero-blob">
            <div className="hero-drop-wrapper">
              <span className="hero-drop">🩸</span>
            </div>
          </div>
          <div className="hero-badge hero-badge-1">
            <span className="hero-badge-dot" style={{ background: "#22c55e" }} />
            {totalDonors !== null ? `${totalDonors} Active Donors` : "Active Donor Network"}
          </div>
          <div className="hero-badge hero-badge-2">
            <span className="hero-badge-dot" style={{ background: "#3b82f6" }} />
            24/7 Emergency Dispatch
          </div>
          <div className="hero-badge hero-badge-3">
            <span className="hero-badge-dot" style={{ background: "#e11d48" }} />
            <span className="hero-pulse-dot" />
            Live Network Active
          </div>
        </div>
      </div>
    </section>
  );
}