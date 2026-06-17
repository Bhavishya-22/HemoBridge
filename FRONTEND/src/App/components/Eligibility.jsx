import '../styles/eligibility.css';

export default function Eligibility() {
  const reqs = [
    "Age between 18 and 65 years",
    "Body weight above 50 kg",
    "Haemoglobin level ≥ 12.5 g/dL",
    "No major illness in the past 6 months",
    "No recent tattoo or piercing (within 12 months)",
    "Not currently on antibiotics or blood thinners",
  ];
  return (
    <section className="section eligibility-bg">
      <div className="section-inner">
        <div className="elig-layout">
          <div>
            <div className="section-label">Who can donate</div>
            <h2 className="section-title">Donor eligibility</h2>
            <p className="section-sub">Most healthy adults qualify. Check the requirements below before registering.</p>
            <div className="elig-list">
              {reqs.map(r => (
                <div className="elig-item" key={r}>
                  <div className="elig-check">✓</div>
                  <span>{r}</span>
                </div>
              ))}
            </div>
            <button className="btn-hero-primary">Learn more about eligibility</button>
          </div>
          <div className="elig-visual">
            <div className="elig-big-num">1 in 3</div>
            <div className="elig-big-label">people will need a blood transfusion in their lifetime</div>
            <div style={{ marginTop: "1.5rem", padding: "1.25rem", background: "var(--rose-light)", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "0.9rem", color: "var(--crimson)", marginBottom: "0.3rem" }}>One donation = 3 lives</div>
              <div style={{ fontSize: "0.82rem", color: "var(--muted)" }}>Your blood is split into red cells, platelets, and plasma — each helping a different patient.</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}