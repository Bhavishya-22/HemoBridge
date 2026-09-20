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

const BLOOD_TRAITS = {
  "O-": { tag: "Universal Donor", color: "#dc2626" },
  "O+": { tag: "Most Needed", color: "#ea580c" },
  "A+": { tag: "High Demand", color: "#b91c1c" },
  "A-": { tag: "Rare Type", color: "#7c3aed" },
  "B+": { tag: "High Demand", color: "#b91c1c" },
  "B-": { tag: "Rare Type", color: "#7c3aed" },
  "AB+": { tag: "Universal Recipient", color: "#0284c7" },
  "AB-": { tag: "Rarest Group", color: "#4f46e5" },
};

export default function BloodGroups() {
  const [groups, setGroups] = useState(FALLBACK_GROUPS);
  const [loading, setLoading] = useState(true);
  const [activeGroup, setActiveGroup] = useState(null);

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
    <section className="section blood-section">
      <div className="section-inner">
        <div className="section-label">
          <span className="live-pulse-dot" /> Live Registry
        </div>
        <h2 className="section-title">Blood group availability</h2>
        <p className="section-sub">
          Real-time donor counts across all blood types from our verified registered donor network.
        </p>
        <div className="blood-grid">
          {groups.map((b) => {
            const trait = BLOOD_TRAITS[b.type] || { tag: "Available", color: "#b91c1c" };
            const isActive = activeGroup === b.type;
            return (
              <div 
                className={`blood-card ${isActive ? "blood-card-active" : ""}`} 
                key={b.type}
                onClick={() => setActiveGroup(isActive ? null : b.type)}
              >
                <div className="blood-card-header">
                  <span className="blood-tag" style={{ color: trait.color, borderColor: `${trait.color}30`, background: `${trait.color}10` }}>
                    {trait.tag}
                  </span>
                </div>
                <div className="blood-type-wrapper">
                  <div className="blood-type">{b.type}</div>
                  <span className="blood-drop-mini">🩸</span>
                </div>
                <div className="blood-count">
                  <span className="blood-dot" style={b.donors > 0 ? { background: "#22c55e" } : { background: "#94a3b8" }} />
                  {loading ? "…" : `${b.donors} donor${b.donors !== 1 ? "s" : ""}`}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}