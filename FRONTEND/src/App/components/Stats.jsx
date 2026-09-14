import { useEffect, useState } from "react";
import "../styles/stats.css";
import { API_BASE } from "../../config/api";

export default function Stats() {
  const [stats, setStats] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/stats`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) {
          if (data?.success) setStats(data);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const items = [
    {
      icon: "👥",
      num: loaded ? (stats?.totalDonors ?? 0).toString() : "…",
      suffix: loaded && stats?.totalDonors > 0 ? "+" : "",
      label: "Registered donors",
    },
    {
      icon: "💉",
      num: loaded ? (stats?.livesSupported ?? 0).toString() : "…",
      suffix: loaded && stats?.livesSupported > 0 ? "+" : "",
      label: "Lives supported",
    },
    {
      icon: "🩸",
      num: "8",
      suffix: "",
      label: "Blood types covered",
    },
    {
      icon: "⏱️",
      num: "24/7",
      suffix: "",
      label: "Emergency support",
    },
  ];

  return (
    <section className="section stats-bg" style={{ padding: 0 }}>
      <div className="stats-grid">
        {items.map((s) => (
          <div className="stat-item" key={s.label}>
            <span className="stat-icon">{s.icon}</span>
            <span className="stat-num">
              {s.num}
              <span>{s.suffix}</span>
            </span>
            <span className="stat-label">{s.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}