import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import "../styles/emergencyBanner.css";

export default function EmergencyBanner() {
  const navigate = useNavigate();
  const { user, isLoggedIn } = useAuth();

  const handleEmergencyRequest = () => {
    if (!isLoggedIn) {
      navigate("/login", { state: { from: "/request" } });
      return;
    }
    if (user?.role === "receiver") {
      navigate("/request");
      return;
    }
    navigate("/request");
  };

  return (
    <div className="emergency">
      <div className="emergency-inner">
        <div className="emergency-label">Urgent?</div>
        <h2 className="emergency-title">Need blood right now?</h2>
        <p className="emergency-sub">
          Our emergency response team is available around the clock. Submit a request and we'll reach out within 15 minutes.
        </p>
        <button
          id="emergency-request-btn"
          className="btn-emergency"
          onClick={handleEmergencyRequest}
        >
          Request blood now →
        </button>
      </div>
    </div>
  );
}