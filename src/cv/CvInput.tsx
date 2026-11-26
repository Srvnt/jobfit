import { useId, useRef, useState, type DragEvent } from "react";
import { extractCvText } from "./extract";

type FileStatus =
  | { kind: "none" }
  | { kind: "reading"; name: string }
  | { kind: "read"; name: string }
  | { kind: "error"; message: string };

interface Props {
  value: string;
  onChange: (text: string) => void;
  disabled?: boolean;
}

/** CV text area that also accepts a .docx, .pdf or .txt file, by picker or drag and drop. */
export function CvInput({ value, onChange, disabled }: Props) {
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<FileStatus>({ kind: "none" });
  const [dragging, setDragging] = useState(false);

  async function load(file: File | undefined) {
    if (!file) return;
    setStatus({ kind: "reading", name: file.name });
    try {
      onChange(await extractCvText(file));
      setStatus({ kind: "read", name: file.name });
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (!disabled) load(e.dataTransfer.files[0]);
  }

  return (
    <div className="field">
      <div className="field-head">
        <label htmlFor={id}>CV</label>
        <button type="button" className="link" onClick={() => fileInput.current?.click()} disabled={disabled}>
          Upload .docx or .pdf
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".docx,.pdf,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          hidden
          onChange={(e) => {
            load(e.target.files?.[0]);
            e.target.value = ""; // allow choosing the same file again
          }}
        />
      </div>
      <textarea
        id={id}
        className={dragging ? "dragging" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        placeholder="Paste your CV as text, or drop a .docx or .pdf file here…"
      />
      <p className={`field-note small ${status.kind === "error" ? "error" : "muted"}`} aria-live="polite">
        {status.kind === "reading" && `Reading ${status.name}…`}
        {status.kind === "read" && `Read ${status.name} on your device. Check the text above before analysing.`}
        {status.kind === "error" && status.message}
      </p>
    </div>
  );
}
