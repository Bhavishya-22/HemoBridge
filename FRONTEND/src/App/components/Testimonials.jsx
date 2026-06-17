import "../styles/testimonials.css";
import { testimonials } from "../data/data";

export default function Testimonials() {
  return (
    <section className="section testimonials-bg">
      <div className="section-inner">
        <div className="section-label">Real stories</div>
        <h2 className="section-title">What people are saying</h2>
        <p className="section-sub">From donors to families — here's how Blood Bank has helped people across India.</p>
        <div className="testi-grid">
          {testimonials.map(t => (
            <div className="testi-card" key={t.name}>
              <div className="testi-stars">★★★★★</div>
              <p className="testi-text">"{t.quote}"</p>
              <div className="testi-author">
                <div className="testi-avatar">{t.initials}</div>
                <div>
                  <div className="testi-name">{t.name}</div>
                  <div className="testi-role">{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}