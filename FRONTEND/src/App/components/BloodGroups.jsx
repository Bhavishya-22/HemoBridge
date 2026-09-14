import { useEffect, useState } from "react";
import "../styles/bloodGroups.css";
import { API_BASE } from "../../config/api";

// Fallback: all 8 groups at 0 so there's never an empty grid
const FALLBACK_GROUPS = [
  { type: "A+", donors: 0 }, { type: "A-", donors: 0 },
  { type: "B+", donors: 0 }, { type: "B-", donors: 0 },
  { type: "AB+", donors: 0 }, { type: "AB-", donors: 0 },
  { type: "O+", donors: 0 }, { type: "O-", donors: 0 },
];

export default function BloodGroups() {
  const [groups, setGroups] = useState(FALLBACK_GROUPS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/stats`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) {
          if (data?.success && Array.isArray(data.bloodGroupCounts) && data.bloodGroupCounts.length > 0) {
            setGroups(data.bloodGroupCounts);
          }
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="section">
      <div className="section-inner">
        <div className="section-label">Live availability</div>
        <h2 className="section-title">Blood group availability</h2>
        <p className="section-sub">
          Real-time donor counts across all blood types from our verified registered donor network.
        </p>
        <div className="blood-grid">
          {groups.map((b) => (
            <div className="blood-card" key={b.type}>
              <div className="blood-type">{b.type}</div>
              <div className="blood-count">
                <span className="blood-dot" style={b.donors > 0 ? { background: "#22c55e" } : { background: "#94a3b8" }} />
                {loading ? "…" : `${b.donors} donor${b.donors !== 1 ? "s" : ""}`}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}