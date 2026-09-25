import { useEffect, useState, useRef } from "react";
import { useLocation } from "react-router-dom";

export default function GlobalErrorWatcher() {
  const [toast, setToast] = useState(null);
  const location = useLocation();
  const lastErrorTextRef = useRef("");
  const timerRef = useRef(null);

  // Clear toast on route changes
  useEffect(() => {
    setToast(null);
    lastErrorTextRef.current = "";
    if (timerRef.current) clearTimeout(timerRef.current);
  }, [location.pathname]);

  const triggerError = (message, targetEl = null) => {
    if (!message || typeof message !== "string") return;
    const cleanMsg = message.trim();
    if (!cleanMsg || cleanMsg.length < 2) return;

    // Avoid duplicate immediate triggers for identical text
    if (lastErrorTextRef.current === cleanMsg && toast) return;
    lastErrorTextRef.current = cleanMsg;

    // 1. Scroll page smoothly to the error element if one exists, otherwise scroll to top
    setTimeout(() => {
      if (targetEl && typeof targetEl.scrollIntoView === "function") {
        targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
        // Add a temporary subtle shake / highlight effect
        targetEl.style.transition = "transform 0.2s ease, box-shadow 0.2s ease";
        targetEl.style.transform = "scale(1.02)";
        targetEl.style.boxShadow = "0 0 0 3px rgba(239, 68, 68, 0.4)";
        setTimeout(() => {
          if (targetEl) {
            targetEl.style.transform = "";
            targetEl.style.boxShadow = "";
          }
        }, 800);
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }, 60);

    // 2. Show top floating pill
    setToast({ message: cleanMsg, targetEl });

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setToast(null);
      lastErrorTextRef.current = "";
    }, 6500);
  };

  useEffect(() => {
    // Expose a global helper callable from anywhere: window.showAppError("...")
    window.showAppError = (msg) => triggerError(msg);

    // Error selector targets across all pages (Profile, Auth, Flow, Forms)
    const ERROR_SELECTORS = [
      '[role="alert"]',
      ".profile-error",
      ".auth-error",
      ".flow-alert.error",
      ".error-message",
      ".alert-error",
      ".form-error",
    ].join(", ");

    const observer = new MutationObserver(() => {
      const errorElements = document.querySelectorAll(ERROR_SELECTORS);
      for (const el of errorElements) {
        // Skip hidden or empty elements
        if (el.offsetParent === null && el.offsetWidth === 0 && el.offsetHeight === 0) continue;
        const text = (el.innerText || el.textContent || "").trim();
        if (text && text.length > 2 && text !== lastErrorTextRef.current) {
          triggerError(text, el);
          break;
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!toast) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: "20px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 999999,
        background: "#dc2626",
        color: "#ffffff",
        padding: "12px 22px",
        borderRadius: "9999px",
        boxShadow: "0 12px 28px rgba(220, 38, 38, 0.45)",
        fontWeight: "600",
        fontSize: "0.95rem",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        cursor: "pointer",
        maxWidth: "92vw",
        animation: "slideDown 0.3s ease-out",
        transition: "all 0.2s ease",
      }}
      onClick={() => {
        if (toast.targetEl && typeof toast.targetEl.scrollIntoView === "function") {
          toast.targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
        } else {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      }}
    >
      <span style={{ fontSize: "1.1rem" }}>⚠️</span>
      <span style={{ flex: 1, whiteSpace: "normal", wordBreak: "break-word" }}>
        {toast.message.replace(/^⚠️\s*/, "")}
      </span>
      <button
        style={{
          background: "rgba(255, 255, 255, 0.2)",
          border: "none",
          color: "#ffffff",
          borderRadius: "50%",
          width: "22px",
          height: "22px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          fontSize: "12px",
          lineHeight: 1,
          padding: 0,
        }}
        onClick={(e) => {
          e.stopPropagation();
          setToast(null);
          lastErrorTextRef.current = "";
        }}
        title="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
