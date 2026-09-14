import { Link } from 'react-router-dom';
import '../styles/footer.css';

export default function Footer() {
  const quickLinks = [
    { label: "Home", path: "/" },
    { label: "Donate blood", path: "/donate" },
    { label: "Request blood", path: "/request" },
    { label: "FAQ & Eligibility", path: "/faq" },
  ];

  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-grid">
          <div>
            <div className="footer-brand-name">Blood<span>Bank</span></div>
            <p className="footer-about">Connecting donors with patients in need across India. Available 24 / 7 for emergencies.</p>
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
              <li><a href="mailto:help@bloodbank.in">📧 help@bloodbank.in</a></li>
              <li><a href="tel:1800123456">📞 1800-123-456</a></li>
              <li><span>📍 Hyderabad, India</span></li>
            </ul>
          </div>
          <div>
            <div className="footer-col-title">Legal</div>
            <ul className="footer-links">
              {["Privacy policy", "Terms of use", "Donor guidelines"].map((l) => (
                <li key={l}><a href="#!">{l}</a></li>
              ))}
            </ul>
          </div>
        </div>
        <hr className="footer-divider" />
        <div className="footer-bottom">
          <span>© 2026 BloodBank. All rights reserved.</span>
          <span>Made with ❤️ to save lives</span>
        </div>
      </div>
    </footer>
  );
}