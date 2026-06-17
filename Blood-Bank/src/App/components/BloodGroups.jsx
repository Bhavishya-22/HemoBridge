import '../styles/bloodGroups.css';
import { bloodGroups } from '../data/data';

export default function BloodGroups() {
  return (
    <section className="section">
      <div className="section-inner">
        <div className="section-label">Live availability</div>
        <h2 className="section-title">Blood group availability</h2>
        <p className="section-sub">Current donor counts across all blood types. Updated daily from verified registered donors.</p>
        <div className="blood-grid">
          {bloodGroups.map(b => (
            <div className="blood-card" key={b.type}>
              <div className="blood-type">{b.type}</div>
              <div className="blood-count"><span className="blood-dot"></span>{b.donors} donors</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}