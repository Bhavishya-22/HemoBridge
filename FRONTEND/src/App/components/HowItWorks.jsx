import '../styles/howItWorks.css';

export default function HowItWorks() {
  return (
    <section className="section" style={{ background: "var(--surface)" }}>
      <div className="section-inner">
        <div className="section-label">Simple process</div>
        <h2 className="section-title">How it works</h2>
        <div className="how-grid">
          <div className="how-card">
            <div className="how-card-title"><span>🩸</span> Requesting blood</div>
            <div className="how-steps">
              {["Fill the blood request form with patient details.", "We instantly search verified donors matching your blood type.", "Matched donors are contacted and you hear back within the hour."].map((s, i) => (
                <div className="how-step" key={i}>
                  <div className="how-step-num">{i + 1}</div>
                  <div className="how-step-text">{s}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="how-card">
            <div className="how-card-title"><span>💉</span> Donating blood</div>
            <div className="how-steps">
              {["Register as a donor — takes under 5 minutes.", "Receive a verification call from our team to confirm eligibility.", "Donate at a partner centre or respond to a live request near you."].map((s, i) => (
                <div className="how-step" key={i}>
                  <div className="how-step-num">{i + 1}</div>
                  <div className="how-step-text">{s}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}