import { useState } from "react";

export function InfoButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      className={`info ${active ? "active" : ""}`}
      title="Efficiency tips"
      onClick={(e) => {
        // Inside a <summary> this must not toggle the section.
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
    >
      i
    </button>
  );
}

export function TipBox({ tips }: { tips: string[] }) {
  return (
    <ul className="tipbox">
      {tips.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
}

/** Self-contained icon + collapsible tip list, for places outside <details>. */
export default function InfoTip({ tips }: { tips: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <InfoButton active={open} onClick={() => setOpen((v) => !v)} />
      {open && <TipBox tips={tips} />}
    </>
  );
}
