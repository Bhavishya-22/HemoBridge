/**
 * Wraps a group of form fields with a title + optional description.
 *
 * Props:
 *  - step: number       -> section number shown in the marker
 *  - title: string
 *  - description: string (optional)
 *  - children: node
 */
export default function FormSection({ step, title, description, children }) {
  return (
    <section className="form-section">
      <div className="form-section__header">
        <span className="form-section__step">{step}</span>
        <div>
          <h2 className="form-section__title">{title}</h2>
          {description && <p className="form-section__desc">{description}</p>}
        </div>
      </div>
      <div className="form-section__body">{children}</div>
    </section>
  );
}