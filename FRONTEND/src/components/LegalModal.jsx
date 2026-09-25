import { useState, useEffect } from "react";

export default function LegalModal({ initialTab = "privacy", isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 999999,
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "680px",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "1.25rem" }}>🩸</span>
            <span style={{ fontWeight: 700, fontSize: "1.15rem", color: "#0f172a" }}>
              HemoBridge Legal & Guidelines
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "#f1f5f9",
              border: "none",
              borderRadius: "50%",
              width: "32px",
              height: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "14px",
              cursor: "pointer",
              color: "#475569",
            }}
          >
            ✕
          </button>
        </div>

        {/* Tab Selector */}
        <div
          style={{
            display: "flex",
            background: "#f8fafc",
            borderBottom: "1px solid #e2e8f0",
            padding: "6px 12px",
            gap: "8px",
          }}
        >
          {[
            { id: "privacy", label: "Privacy Policy" },
            { id: "terms", label: "Terms of Use" },
            { id: "guidelines", label: "Donor Guidelines" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1,
                padding: "8px 12px",
                border: "none",
                borderRadius: "8px",
                background: activeTab === tab.id ? "#dc2626" : "transparent",
                color: activeTab === tab.id ? "#ffffff" : "#475569",
                fontWeight: activeTab === tab.id ? "600" : "500",
                fontSize: "0.88rem",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Modal Scrollable Body */}
        <div
          style={{
            padding: "24px",
            overflowY: "auto",
            lineHeight: 1.65,
            color: "#334155",
            fontSize: "0.92rem",
          }}
        >
          {activeTab === "privacy" && (
            <div>
              <h3 style={{ margin: "0 0 12px", color: "#0f172a", fontSize: "1.2rem" }}>
                Privacy Policy
              </h3>
              <p style={{ margin: "0 0 14px", fontSize: "0.85rem", color: "#64748b" }}>
                Last updated: September 2026
              </p>

              <h4 style={{ margin: "16px 0 6px", color: "#0f172a" }}>1. Information We Collect</h4>
              <p style={{ margin: "0 0 12px" }}>
                We collect personal information necessary to connect voluntary blood donors with urgent requests, including your name, contact phone number, blood group, role (donor, recipient, or hospital), and geographic location coordinates when submitted.
              </p>

              <h4 style={{ margin: "16px 0 6px", color: "#0f172a" }}>2. How Information is Used</h4>
              <p style={{ margin: "0 0 12px" }}>
                Your data is exclusively used for:
              </p>
              <ul style={{ margin: "0 0 12px", paddingLeft: "20px" }}>
                <li>Matching eligible donors within proximity to emergency blood requests</li>
                <li>Sending critical SMS/Email alerts and OTP verifications</li>
                <li>Hospital administrative verification and donation tracking</li>
              </ul>

              <h4 style={{ margin: "16px 0 6px", color: "#0f172a" }}>3. Data Privacy & Confidentiality</h4>
              <p style={{ margin: "0 0 12px" }}>
                HemoBridge strictly does <strong>not sell, rent, or commercialize</strong> your personal or medical data to any third party or marketing service. Access to your contact phone number is limited to parties directly involved in an accepted emergency request.
              </p>

              <h4 style={{ margin: "16px 0 6px", color: "#0f172a" }}>4. Account Control & Contact</h4>
              <p style={{ margin: 0 }}>
                You may review, update, or remove your contact details at any time from your Profile settings or by contacting our team at{" "}
                <a href="mailto:hemobridge.support@gmail.com" style={{ color: "#dc2626", fontWeight: 600 }}>
                  hemobridge.support@gmail.com
                </a>.
              </p>
            </div>
          )}

          {activeTab === "terms" && (
            <div>
              <h3 style={{ margin: "0 0 12px", color: "#0f172a", fontSize: "1.2rem" }}>
                Terms of Use
              </h3>
              <p style={{ margin: "0 0 14px", fontSize: "0.85rem", color: "#64748b" }}>
                Last updated: September 2026
              </p>

              <h4 style={{ margin: "16px 0 6px", color: "#0f172a" }}>1. Voluntary Platform</h4>
              <p style={{ margin: "0 0 12px" }}>
                HemoBridge is a voluntary, humanitarian connection network that links blood donors, recipients, and registered hospitals. Blood donation must always be voluntary and unpaid. <strong>Selling or purchasing blood for monetary profit is strictly prohibited</strong> by law.
              </p>

              <h4 style={{ margin: "16px 0 6px", color: "#0f172a" }}>2. Emergency Medical Disclaimer</h4>
              <p style={{ margin: "0 0 12px" }}>
                HemoBridge is a digital coordination bridge and does not provide direct medical treatment or ambulance dispatch services. In critical emergencies, please always call national emergency services (<strong>108 / 112</strong>) or proceed directly to the nearest hospital.
              </p>

              <h4 style={{ margin: "16px 0 6px", color: "#0f172a" }}>3. User Honesty & Safety</h4>
              <p style={{ margin: "0 0 12px" }}>
                Users represent that all submitted profile details (including blood group, medical history, and contact numbers) are accurate. Fake requests or harassment will result in immediate permanent account termination.
              </p>

              <h4 style={{ margin: "16px 0 6px", color: "#0f172a" }}>4. Questions</h4>
              <p style={{ margin: 0 }}>
                For questions regarding terms, reach out to us at{" "}
                <a href="tel:+917981802087" style={{ color: "#dc2626", fontWeight: 600 }}>
                  +91 7981802087
                </a>.
              </p>
            </div>
          )}

          {activeTab === "guidelines" && (
            <div>
              <h3 style={{ margin: "0 0 12px", color: "#0f172a", fontSize: "1.2rem" }}>
                Blood Donor Guidelines
              </h3>
              <p style={{ margin: "0 0 14px", fontSize: "0.85rem", color: "#64748b" }}>
                Standard Clinical Eligibility Standards
              </p>

              <h4 style={{ margin: "16px 0 6px", color: "#0f172a" }}>1. General Eligibility Criteria</h4>
              <ul style={{ margin: "0 0 12px", paddingLeft: "20px" }}>
                <li><strong>Age:</strong> 18 to 65 years old</li>
                <li><strong>Weight:</strong> Minimum 45 kg (whole blood)</li>
                <li><strong>Hemoglobin:</strong> Minimum 12.5 g/dL</li>
                <li><strong>Interval:</strong> At least 90 days (3 months) since your last blood donation</li>
              </ul>

              <h4 style={{ margin: "16px 0 6px", color: "#0f172a" }}>2. Pre-Donation Preparation</h4>
              <ul style={{ margin: "0 0 12px", paddingLeft: "20px" }}>
                <li>Hydrate well: drink 500ml of water before donation</li>
                <li>Eat a healthy meal 2 to 3 hours prior; avoid donating on an empty stomach</li>
                <li>Avoid alcohol consumption for 24 hours prior</li>
                <li>Ensure at least 6-8 hours of sound sleep the night before</li>
              </ul>

              <h4 style={{ margin: "16px 0 6px", color: "#0f172a" }}>3. Temporary Deferral Conditions</h4>
              <ul style={{ margin: "0 0 12px", paddingLeft: "20px" }}>
                <li>Tattoos or body piercings: Defer for 6 months</li>
                <li>Recent dental extraction: Defer for 72 hours</li>
                <li>Antibiotic treatment or active fever/infection: Wait until fully recovered</li>
                <li>Recent major surgery: Defer for 6 to 12 months</li>
              </ul>

              <h4 style={{ margin: "16px 0 6px", color: "#0f172a" }}>4. Post-Donation Care</h4>
              <p style={{ margin: 0 }}>
                Rest for 10-15 minutes after donation, enjoy light refreshments, keep hydrated, and avoid strenuous exercise for the remainder of the day.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 24px",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "flex-end",
            background: "#f8fafc",
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "8px 20px",
              background: "#0f172a",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
