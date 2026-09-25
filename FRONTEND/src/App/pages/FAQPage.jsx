import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { FAQ_CATEGORIES, FAQ_ITEMS, BLOOD_COMPATIBILITY_DATA } from "../data/faqFullData";
import Footer from "../components/Footer";
import "../styles/faqPage.css";

export default function FAQPage() {
  const navigate = useNavigate();
  const { user, isLoggedIn } = useAuth();

  const [activeCategory, setActiveCategory] = useState("all");
  const [openIds, setOpenIds] = useState(() => new Set(["process-1", "eligibility-1"]));
  const [showCompatibility, setShowCompatibility] = useState(true);

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Filtered FAQ items based on category
  const filteredItems = useMemo(() => {
    return FAQ_ITEMS.filter((item) => {
      return activeCategory === "all" || item.category === activeCategory;
    });
  }, [activeCategory]);

  // Counts per category
  const categoryCounts = useMemo(() => {
    const counts = { all: FAQ_ITEMS.length };
    FAQ_CATEGORIES.forEach((cat) => {
      if (cat.id !== "all") {
        counts[cat.id] = FAQ_ITEMS.filter((i) => i.category === cat.id).length;
      }
    });
    return counts;
  }, []);

  const toggleItem = (id) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const allVisibleOpen = filteredItems.length > 0 && filteredItems.every((item) => openIds.has(item.id));

  const toggleExpandAll = () => {
    if (allVisibleOpen) {
      setOpenIds(new Set());
    } else {
      setOpenIds(new Set(filteredItems.map((i) => i.id)));
    }
  };

  const handleRequestAction = () => {
    if (!isLoggedIn) {
      navigate("/signup");
      return;
    }
    if (user?.role === "receiver") {
      navigate("/request");
      return;
    }
    // Donors / hospitals / admins can't place requests — send to signup to register as receiver
    navigate("/signup");
  };

  const handleDonateAction = () => {
    if (!isLoggedIn) {
      navigate("/login", { state: { from: "/donate" } });
      return;
    }
    if (user?.role === "donor") {
      navigate("/donate");
      return;
    }
    navigate("/signup");
  };

  return (
    <div className="faq-page-wrapper">
      {/* Hero Section */}
      <section className="faq-hero">
        <div className="faq-hero-container">
          <div className="faq-eyebrow">
            <span className="faq-eyebrow-icon">🩸</span>
            <span>Help & Knowledge Base</span>
          </div>

          <h1 className="faq-title">
            Frequently Asked <em>Questions</em>
          </h1>

          <p className="faq-sub">
            Find everything you need to know about blood donation eligibility, emergency patient
            requests, recovery guidelines, and how our life-saving community works.
          </p>
        </div>

        {/* Quick Highlights Strip */}
        <div className="faq-highlights-strip">
          <div className="faq-highlight-card">
            <span className="faq-highlight-icon">⚡</span>
            <div>
              <div className="faq-highlight-title">15-Min Match</div>
              <div className="faq-highlight-desc">Rapid emergency donor dispatch</div>
            </div>
          </div>
          <div className="faq-highlight-card">
            <span className="faq-highlight-icon">🛡️</span>
            <div>
              <div className="faq-highlight-title">100% Sterile</div>
              <div className="faq-highlight-desc">Single-use sealed medical kits</div>
            </div>
          </div>
          <div className="faq-highlight-card">
            <span className="faq-highlight-icon">🩺</span>
            <div>
              <div className="faq-highlight-title">Free Screening</div>
              <div className="faq-highlight-desc">Hb, pulse, and BP check at visit</div>
            </div>
          </div>
          <div className="faq-highlight-card">
            <span className="faq-highlight-icon">❤️</span>
            <div>
              <div className="faq-highlight-title">1 Donor = 3 Lives</div>
              <div className="faq-highlight-desc">Red cells, plasma & platelets</div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="faq-content-wrap">
        {/* Category Pills */}
        <div className="faq-categories" role="tablist" aria-label="FAQ Categories">
          {FAQ_CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                role="tab"
                aria-selected={isActive}
                className={`faq-category-btn ${isActive ? "active" : ""}`}
                onClick={() => setActiveCategory(cat.id)}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
                <span className="faq-cat-count">{categoryCounts[cat.id] || 0}</span>
              </button>
            );
          })}
        </div>

        {/* Action and Count Bar */}
        <div className="faq-controls-row">
          <div className="faq-count-text">
            Showing <span>{filteredItems.length}</span> {filteredItems.length === 1 ? "question" : "questions"}
          </div>

          {filteredItems.length > 0 && (
            <button className="faq-toggle-all-btn" onClick={toggleExpandAll}>
              {allVisibleOpen ? "Collapse all" : "Expand all"}
            </button>
          )}
        </div>

        {/* Accordion Questions List */}
        <div className="faq-accordion-list">
          {filteredItems.map((item) => {
            const isOpen = openIds.has(item.id);
            return (
              <div key={item.id} className={`faq-card-item ${isOpen ? "open" : ""}`}>
                <button
                  className="faq-card-trigger"
                  onClick={() => toggleItem(item.id)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-answer-${item.id}`}
                  id={`faq-trigger-${item.id}`}
                >
                  <div className="faq-card-trigger-left">
                    <span className="faq-badge-category">{item.categoryLabel}</span>
                    <span className="faq-card-question">{item.q}</span>
                  </div>
                  <div className="faq-chevron-circle" aria-hidden="true">
                    ▼
                  </div>
                </button>

                {isOpen && (
                  <div
                    id={`faq-answer-${item.id}`}
                    role="region"
                    aria-labelledby={`faq-trigger-${item.id}`}
                    className="faq-card-answer-wrap"
                  >
                    <div className="faq-card-answer-text">{item.a}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Blood Group Compatibility Matrix Section */}
        <section className="faq-compatibility-card" aria-label="Blood Group Compatibility Quick Guide">
          <div className="faq-compat-header">
            <div>
              <h2 className="faq-compat-title">
                <span>🩸</span> Blood Compatibility Quick Guide
              </h2>
              <p className="faq-compat-sub">
                Quick reference for transfusions and donor-recipient compatibility rules.
              </p>
            </div>
            <button
              className="faq-toggle-all-btn"
              onClick={() => setShowCompatibility((v) => !v)}
              aria-expanded={showCompatibility}
            >
              {showCompatibility ? "Hide chart" : "Show chart"}
            </button>
          </div>

          {showCompatibility && (
            <div className="faq-compat-grid">
              {BLOOD_COMPATIBILITY_DATA.map((row) => (
                <div key={row.group} className="faq-compat-item">
                  <div className="faq-compat-item-top">
                    <span className="faq-compat-group-tag">{row.group}</span>
                    <span className="faq-compat-badge">{row.badge}</span>
                  </div>
                  <div>
                    <div className="faq-compat-label">Can Give To</div>
                    <div className="faq-compat-val">{row.givesTo}</div>
                  </div>
                  <div>
                    <div className="faq-compat-label">Can Receive From</div>
                    <div className="faq-compat-val">{row.receivesFrom}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Emergency Assistance & Action Card */}
        <section className="faq-support-box" aria-label="Still need assistance">
          <div className="faq-support-text">
            <span className="faq-support-tag">24 / 7 Emergency Response</span>
            <h2 className="faq-support-title">Still have questions or need blood urgently?</h2>
            <p className="faq-support-desc">
              Our dedicated medical dispatch coordinators are available around the clock. Whether you
              need to place an immediate critical request or register to donate, we are here for you.
            </p>
          </div>

          <div className="faq-support-actions">
            <button
              id="faq-action-request"
              className="faq-btn-request"
              onClick={handleRequestAction}
            >
              <span>🩸</span> Request Blood Now
            </button>
            <button
              id="faq-action-donate"
              className="faq-btn-donor"
              onClick={handleDonateAction}
            >
              <span>💉</span> Become a Donor
            </button>
            <div className="faq-support-helpline">
              <span>Helpline:</span>
              <a href="tel:+917981802087" style={{ color: "inherit", textDecoration: "none" }}>
                <strong>+91 7981802087</strong>
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}