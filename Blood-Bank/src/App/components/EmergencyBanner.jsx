import "../styles/emergencyBanner.css";

export default function EmergencyBanner() {
  return (
    <div className="emergency">
      <div className="emergency-inner">
        <div className="emergency-label">Urgent?</div>
        <h2 className="emergency-title">Need blood right now?</h2>
        <p className="emergency-sub">Our emergency response team is available around the clock. Submit a request and we'll reach out within 15 minutes.</p>
        <button className="btn-emergency">Request blood now →</button>
      </div>
    </div>
  );
}