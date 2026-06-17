import '../styles/footer.css'

export default function Footer() {
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
              {["Home", "Donate blood", "Request blood", "Awareness", "FAQ"].map(l => (
                <li key={l}><a href="#">{l}</a></li>
              ))}
            </ul>
          </div>
          <div>
            <div className="footer-col-title">Contact</div>
            <ul className="footer-links">
              <li><a href="#">📧 help@bloodbank.in</a></li>
              <li><a href="#">📞 1800-XXX-XXXX</a></li>
              <li><a href="#">📍 Hyderabad, India</a></li>
            </ul>
          </div>
          <div>
            <div className="footer-col-title">Legal</div>
            <ul className="footer-links">
              {["Privacy policy", "Terms of use", "Cookie policy"].map(l => (
                <li key={l}><a href="#">{l}</a></li>
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