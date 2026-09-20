import { useState, useEffect, useCallback, useRef } from "react";
import { API_BASE } from "../../config/api";

const ENV_GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

export default function GoogleAuthButton({
  text = "Continue with Google",
  onSuccess,
  onError,
  containerId = "google-sso-container",
}) {
  const [loading, setLoading] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [effectiveClientId, setEffectiveClientId] = useState(
    ENV_GOOGLE_CLIENT_ID && !ENV_GOOGLE_CLIENT_ID.startsWith("YOUR_")
      ? ENV_GOOGLE_CLIENT_ID.trim()
      : ""
  );
  const [gisMounted, setGisMounted] = useState(false);
  const [currentOrigin, setCurrentOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  const initAttempted = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setCurrentOrigin(window.location.origin);
    }
  }, []);

  // Authenticate with backend using credential (or demo flag)
  const authenticateWithBackend = useCallback(
    async ({ credential, isDemo = false }) => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/auth/google`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential, isDemo }),
        });
        const data = await res.json();

        if (!res.ok) {
          if (onError) onError(data.message || "Google authentication failed.");
          return;
        }

        if (onSuccess) onSuccess(data.user);
      } catch {
        if (onError)
          onError("Unable to connect to authentication server. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [onSuccess, onError]
  );

  // Fetch client ID from backend if not available in frontend .env
  useEffect(() => {
    let isMounted = true;
    async function fetchBackendClientId() {
      if (effectiveClientId) return;
      try {
        const res = await fetch(`${API_BASE}/auth/google-client-id`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.clientId) {
            setEffectiveClientId(data.clientId);
          }
        }
      } catch {
        // Backend might be offline or starting up
      }
    }
    fetchBackendClientId();
    return () => {
      isMounted = false;
    };
  }, [effectiveClientId]);

  // Mount Google Identity Services button once client ID and window.google are available
  useEffect(() => {
    if (!effectiveClientId) return;

    function renderGis() {
      if (!window.google?.accounts?.id) return false;

      try {
        window.google.accounts.id.initialize({
          client_id: effectiveClientId,
          callback: (response) => {
            if (response && response.credential) {
              authenticateWithBackend({ credential: response.credential });
            }
          },
        });

        const el = document.getElementById(containerId);
        if (el) {
          el.innerHTML = "";
          window.google.accounts.id.renderButton(el, {
            theme: "outline",
            size: "large",
            width: 320,
            text: text.includes("Sign up") ? "signup_with" : "continue_with",
            shape: "rectangular",
            logo_alignment: "left",
          });
          setGisMounted(true);
          return true;
        }
      } catch (e) {
        console.warn("[Google Auth] Error rendering GIS button:", e);
      }
      return false;
    }

    if (!renderGis()) {
      const interval = setInterval(() => {
        if (renderGis()) {
          clearInterval(interval);
        }
      }, 200);
      const timer = setTimeout(() => clearInterval(interval), 5000);
      return () => {
        clearInterval(interval);
        clearTimeout(timer);
      };
    }
  }, [effectiveClientId, containerId, text, authenticateWithBackend]);

  const handleClick = () => {
    if (effectiveClientId && window.google?.accounts?.id) {
      try {
        window.google.accounts.id.prompt((notification) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            setShowSetupModal(true);
          }
        });
      } catch {
        setShowSetupModal(true);
      }
    } else {
      setShowSetupModal(true);
    }
  };

  const handleDemoSignIn = () => {
    setShowSetupModal(false);
    authenticateWithBackend({ isDemo: true, credential: "demo-google-credential" });
  };

  return (
    <>
      <div className="google-auth-container">
        {/* If GIS renders its native button, it mounts inside here */}
        <div
          id={containerId}
          className="google-gis-target"
          style={{ display: gisMounted ? "flex" : "none" }}
        ></div>

        {/* Fallback button if GIS not rendered or still loading */}
        {!gisMounted && (
          <button
            type="button"
            className="google-sso-button"
            onClick={handleClick}
            disabled={loading}
            aria-label={text}
          >
            {loading ? (
              <span className="google-btn-spinner"></span>
            ) : (
              <svg
                className="google-svg-icon"
                viewBox="0 0 24 24"
                width="20"
                height="20"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
            )}
            <span className="google-btn-label">{loading ? "Connecting..." : text}</span>
          </button>
        )}
      </div>

      {/* ── Setup & Demo Modal ── */}
      {showSetupModal && (
        <div className="google-modal-overlay" onClick={() => setShowSetupModal(false)}>
          <div
            className="google-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="google-modal-header">
              <div className="google-modal-icon">
                <svg viewBox="0 0 24 24" width="28" height="28">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="google-modal-title">Google Authentication</h3>
                <p className="google-modal-subtitle">Ready to authenticate donors & users</p>
              </div>
            </div>

            <div className="google-modal-body">
              <div style={{
                background: "#f1f5f9",
                borderRadius: "8px",
                padding: "12px 14px",
                marginBottom: "14px",
                fontSize: "0.85rem",
                color: "#334155"
              }}>
                <div style={{ marginBottom: "6px" }}><strong>Client ID:</strong> {effectiveClientId ? "✅ Configured (" + effectiveClientId.slice(0, 12) + "...)" : "❌ Not detected (check .env files)"}</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "6px" }}>
                  <div><strong>Active Origin:</strong> <code style={{ wordBreak: "break-all" }}>{currentOrigin || "http://localhost:5173"}</code></div>
                  <button
                    type="button"
                    onClick={() => {
                      if (currentOrigin) {
                        navigator.clipboard?.writeText(currentOrigin);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2500);
                      }
                    }}
                    style={{
                      background: copied ? "#16a34a" : "#475569",
                      color: "#fff",
                      border: "none",
                      borderRadius: "4px",
                      padding: "3px 8px",
                      fontSize: "0.75rem",
                      cursor: "pointer"
                    }}
                  >
                    {copied ? "✓ Copied!" : "Copy Origin"}
                  </button>
                </div>
              </div>

              <div className="google-modal-guide">
                <div className="guide-step">
                  <span className="step-num">1</span>
                  <span>Open <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" style={{ color: "#2563eb", textDecoration: "underline" }}>Google Cloud Credentials</a></span>
                </div>
                <div className="guide-step">
                  <span className="step-num">2</span>
                  <span>Click your Web Client ID and add <code>{currentOrigin || "http://localhost:5173"}</code> under <strong>Authorized JavaScript origins</strong></span>
                </div>
                <div className="guide-step">
                  <span className="step-num">3</span>
                  <span>Save changes in Google Console (takes 2-5 mins to activate)</span>
                </div>
              </div>

              <div className="google-modal-demo-box">
                <div className="demo-box-badge">DEV / PREVIEW MODE</div>
                <p className="demo-box-text">
                  You can immediately test the complete Google donor login flow right now:
                </p>
                <button
                  type="button"
                  className="google-demo-btn"
                  onClick={handleDemoSignIn}
                >
                  ⚡ Continue with Demo Google Account
                </button>
              </div>
            </div>

            <div className="google-modal-footer">
              <button
                type="button"
                className="google-modal-close-btn"
                onClick={() => setShowSetupModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
