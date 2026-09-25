import { useState } from 'react';
import { Link } from 'react-router-dom';
import LegalModal from '../../components/LegalModal';
import '../styles/footer.css';

export default function Footer() {
  const [legalModal, setLegalModal] = useState({ isOpen: false, tab: "privacy" });

  const quickLinks = [
    { label: "Home", path: "/" },
    { label: "Donate blood", path: "/donate" },
    { label: "Request blood", path: "/request" },
    { label: "FAQ & Eligibility", path: "/faq" },
  ];

  const openLegal = (tab) => {
    setLegalModal({ isOpen: true, tab });
  };

  return (
    <>
      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-grid">
            <div>
              <div className="footer-brand-name">Hemo<span>Bridge</span></div>
              <p className="footer-about">Connecting voluntary blood donors with patients in urgent need. Available 24 / 7 for life-saving coordination.</p>
              <div className="footer-social">
                {["📷", "💼", "🐦"].map((icon, i) => (
                  <button className="social-btn" key={i}>{icon}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="footer-col-title">Quick links</div>
              <ul className="footer-links">
                {quickLinks.map((item) => (
                  <li key={item.label}>
                    <Link to={item.path}>{item.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="footer-col-title">Contact</div>
              <ul className="footer-links">
                <li><a href="mailto:hemobridge.support@gmail.com">📧 hemobridge.support@gmail.com</a></li>
                <li><a href="tel:+917981802087">📞 +91 7981802087</a></li>
                <li><span>📍 Hyderabad, India</span></li>
              </ul>
            </div>
            <div>
              <div className="footer-col-title">Legal</div>
              <ul className="footer-links">
                <li>
                  <button 
                    onClick={() => openLegal("privacy")} 
                    style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "inherit", cursor: "pointer", textAlign: "left" }}
                  >
                    Privacy policy
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => openLegal("terms")} 
                    style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "inherit", cursor: "pointer", textAlign: "left" }}
                  >
                    Terms of use
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => openLegal("guidelines")} 
                    style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "inherit", cursor: "pointer", textAlign: "left" }}
                  >
                    Donor guidelines
                  </button>
                </li>
              </ul>
            </div>
          </div>
          <hr className="footer-divider" />
          <div className="footer-bottom">
            <span>© 2026 HemoBridge. All rights reserved.</span>
            <span>Made with ❤️ to save lives</span>
          </div>
        </div>
      </footer>

      <LegalModal
        isOpen={legalModal.isOpen}
        initialTab={legalModal.tab}
        onClose={() => setLegalModal({ isOpen: false, tab: "privacy" })}
      />
    </>
  );
}