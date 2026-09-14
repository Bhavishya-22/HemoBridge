import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import '../styles/CTA.css';

export default function CTA() {
  const navigate = useNavigate();
  const { user, isLoggedIn } = useAuth();

  const handleDonate = () => {
    if (!isLoggedIn) { navigate("/login"); return; }
    if (user?.role === "donor") { navigate("/donate"); return; }
    navigate("/signup");
  };

  const handleRequest = () => {
    if (!isLoggedIn) { navigate("/login"); return; }
    if (user?.role === "receiver") { navigate("/request"); return; }
    navigate("/signup");
  };

  return (
    <section className="cta-section">
      <div className="cta-inner">
        <h2 className="cta-title">Be someone's <em>lifeline</em> today</h2>
        <p className="cta-sub">It costs nothing but a little time. Your donation could be the reason someone makes it home tonight.</p>
        <div className="cta-btns">
          <button className="btn-hero-primary" onClick={handleDonate}>Donate blood</button>
          <button className="btn-hero-secondary" onClick={handleRequest}>Request blood</button>
        </div>
      </div>
    </section>
  );
}