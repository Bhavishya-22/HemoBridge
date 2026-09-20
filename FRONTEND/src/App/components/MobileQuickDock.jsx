import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import "../styles/mobileDock.css";

export default function MobileQuickDock() {
  const navigate = useNavigate();
  const { isLoggedIn, user } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      // Show dock after scrolling down 250px so it doesn't overlap the initial hero buttons
      if (window.scrollY > 250) {
        setVisible(true);
      } else {
        setVisible(false);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleRequest = () => {
    if (!isLoggedIn) {
      navigate("/login", { state: { from: "/request" } });
      return;
    }
    navigate("/request");
  };

  const handleDonate = () => {
    if (!isLoggedIn) {
      navigate("/signup");
      return;
    }
    if (user?.role === "donor") {
      navigate("/donate");
      return;
    }
    navigate("/signup");
  };

  if (!visible) return null;

  return (
    <div className="mobile-quick-dock" role="navigation" aria-label="Quick Actions">
      <div className="dock-glass-pill">
        <button
          type="button"
          className="dock-action-btn dock-request-btn"
          onClick={handleRequest}
          aria-label="Request Blood"
        >
          <span className="dock-icon">🩸</span>
          <span className="dock-label">Request</span>
        </button>

        <div className="dock-divider" />

        <button
          type="button"
          className="dock-action-btn dock-donate-btn"
          onClick={handleDonate}
          aria-label="Donate Blood"
        >
          <span className="dock-icon">❤️</span>
          <span className="dock-label">Donate</span>
        </button>

        <div className="dock-divider" />

        <button
          type="button"
          className="dock-action-btn dock-sos-btn"
          onClick={() => {
            const emergencyEl = document.querySelector(".emergency");
            if (emergencyEl) {
              emergencyEl.scrollIntoView({ behavior: "smooth" });
            } else {
              handleRequest();
            }
          }}
          aria-label="Emergency SOS"
        >
          <span className="dock-pulse-ring" />
          <span className="dock-icon">🚨</span>
          <span className="dock-label">SOS</span>
        </button>
      </div>
    </div>
  );
}
