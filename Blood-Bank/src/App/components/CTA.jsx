import '../styles/CTA.css';

export default function CTA() {
  return (
    <section className="cta-section">
      <div className="cta-inner">
        <h2 className="cta-title">Be someone's <em>lifeline</em> today</h2>
        <p className="cta-sub">It costs nothing but a little time. Your donation could be the reason someone makes it home tonight.</p>
        <div className="cta-btns">
          <button className="btn-hero-primary">Donate blood</button>
          <button className="btn-hero-secondary">Request blood</button>
        </div>
      </div>
    </section>
  );
}