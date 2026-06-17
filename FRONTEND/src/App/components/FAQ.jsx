import { useState } from "react";
import "../styles/faq.css";
import { faqData } from "../data/data";

export default function FAQ() {
  const [open, setOpen] = useState(null);
  return (
    <section className="section">
      <div className="section-inner">
        <div className="section-label">Common questions</div>
        <h2 className="section-title">Frequently asked questions</h2>
        <div className="faq-list">
          {faqData.map((f, i) => (
            <div className="faq-item" key={i}>
              <button className="faq-q" onClick={() => setOpen(open === i ? null : i)}>
                {f.q}
                <span className={`faq-chevron ${open === i ? "open" : ""}`}>▾</span>
              </button>
              {open === i && <div className="faq-a">{f.a}</div>}
            </div>
          ))}
        </div>
        <div className="faq-cta">
          <button className="btn-ghost">View all FAQs →</button>
        </div>
      </div>
    </section>
  );
}