import "../styles/hero.css";

export default function Hero() {
  return (
    <section className="hero">
      <div className="hero-inner">
        <div>
          <div className="hero-eyebrow"><span className="hero-eyebrow-dot"></span>India's trusted donor network</div>
          <h1 className="hero-h1">Every drop counts,<br />every <em>donor</em> matters</h1>
          <p className="hero-sub">Connect blood donors with patients in need. Request blood, donate blood, and help save lives — all in one place.</p>
          <div className="hero-ctas">
            <button className="btn-hero-primary">🩸 Request blood</button>
            <button className="btn-hero-secondary">Become a donor</button>
          </div>
        </div>
        <div className="hero-visual">
          <div className="hero-blob">
            <span className="hero-drop">🩸</span>
          </div>
          <div className="hero-badge hero-badge-1">
            <span className="hero-badge-dot" style={{ background: "#22c55e" }}></span>
            500+ active donors
          </div>
          <div className="hero-badge hero-badge-2">
            <span className="hero-badge-dot" style={{ background: "#3b82f6" }}></span>
            24 / 7 emergency support
          </div>
        </div>
      </div>
    </section>
  );
}