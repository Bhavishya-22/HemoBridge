import "../styles/whyDonate.css";
import { whyCards } from "../data/data";

export default function WhyDonate() {
  return (
    <section className="section">
      <div className="section-inner">
        <div className="section-label">Why it matters</div>
        <h2 className="section-title">Why donate blood?</h2>
        <p className="section-sub">Every 2 seconds, someone in India needs blood. Here's why your donation makes a real difference.</p>
        <div className="why-grid">
          {whyCards.map(c => (
            <div className="why-card" key={c.title}>
              <span className="why-icon">{c.icon}</span>
              <div className="why-title">{c.title}</div>
              <div className="why-desc">{c.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}