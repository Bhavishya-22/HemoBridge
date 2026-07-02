import { useRef } from "react";

/**
 * Reusable drag/click file upload box.
 *
 * Props:
 *  - label: string            -> field label
 *  - hint: string              -> helper text under the label
 *  - file: File | null         -> currently selected file
 *  - onChange: (file) => void  -> called with the new File
 *  - accept: string            -> input accept attr (default images + pdf)
 *  - required: bool
 */
export default function FileUploadBox({
  label,
  hint,
  file,
  onChange,
  accept = ".pdf,.jpg,.jpeg,.png",
  required = false,
}) {
  const inputRef = useRef(null);

  const handleFiles = (fileList) => {
    if (fileList && fileList[0]) onChange(fileList[0]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove("upload-box--dragover");
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="upload-field">
      <label className="field-label">
        {label} {required && <span className="required-mark">*</span>}
      </label>
      {hint && <p className="field-hint">{hint}</p>}

      <div
        className={`upload-box ${file ? "upload-box--filled" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          e.currentTarget.classList.add("upload-box--dragover");
        }}
        onDragLeave={(e) => e.currentTarget.classList.remove("upload-box--dragover")}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />

        {file ? (
          <div className="upload-box__file">
            <span className="upload-box__icon">📄</span>
            <div className="upload-box__meta">
              <p className="upload-box__name">{file.name}</p>
              <p className="upload-box__size">{(file.size / 1024).toFixed(0)} KB</p>
            </div>
            <button
              type="button"
              className="upload-box__remove"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
            >
              ✕
            </button>
          </div>
        ) : (
          <div className="upload-box__empty">
            <span className="upload-box__icon">⬆</span>
            <p>
              <strong>Click to upload</strong> or drag and drop
            </p>
            <p className="upload-box__types">PDF, JPG or PNG</p>
          </div>
        )}
      </div>
    </div>
  );
}