'use client';

// A labeled card wrapper for one HeaderPickerStrip block — shared by Tab and
// Overview Tab's Title Cards / Graphs / Headers fields.
export default function Field({ label, hint, children }) {
  return (
    <div className="rounded-lg border border-divider bg-card p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-foreground">{label}</span>
        {hint && <span className="text-[11px] text-subtle">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
