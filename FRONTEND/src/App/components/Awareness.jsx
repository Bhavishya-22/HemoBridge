import "../styles/awareness.css";
import { awarenessCards } from "../data/data";

export default function Awareness() {
  return (
    <section className="section awareness-bg">
      <div className="section-inner">
        <div className="section-label" style={{ color: "rgba(244,63,94,0.8)" }}>Learn more</div>
        <h2 className="section-title" style={{ color: "var(--white)" }}>Awareness centre</h2>
        <p className="section-sub" style={{ color: "rgba(255,255,255,0.55)" }}>Facts, myths, and stories to help you understand the importance of blood donation.</p>
        <div className="awareness-grid">
          {awarenessCards.map(c => (
            <div className="aware-card" key={c.title}>
              <span className="aware-icon">{c.icon}</span>
              <div className="aware-title">{c.title}</div>
              <div className="aware-desc">{c.desc}</div>
            </div>
          ))}
        </div>
        <button className="btn-outline-white">Explore all articles →</button>
      </div>
    </section>
  );
}