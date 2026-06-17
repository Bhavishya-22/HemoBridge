import "../styles/stats.css";

export default function Stats() {
  const items = [
    { icon: "👥", num: "500", suffix: "+", label: "Registered donors" },
    { icon: "💉", num: "300", suffix: "+", label: "Lives supported" },
    { icon: "🩸", num: "8", suffix: "", label: "Blood types covered" },
    { icon: "⏱️", num: "24/7", suffix: "", label: "Emergency support" },
  ];
  return (
    <section className="section stats-bg" style={{ padding: 0 }}>
      <div className="stats-grid">
        {items.map(s => (
          <div className="stat-item" key={s.label}>
            <span className="stat-icon">{s.icon}</span>
            <span className="stat-num">{s.num}<span>{s.suffix}</span></span>
            <span className="stat-label">{s.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}