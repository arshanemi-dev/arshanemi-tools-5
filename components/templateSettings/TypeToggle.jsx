'use client';

const LABELS = { formula: 'Formula', number: 'Number', text: 'Text', alphanumeric: 'Alphanumeric', date: 'Date', graphDesign: 'Graph Design' };

// The "Formula / Number / Text / Alphanumeric / Date" pills from the Header
// design — separate rounded pills, green when active. Used by Header / Title
// Card / Graph Data (which pass their own, shorter option lists).
export default function TypeToggle({ value, onChange, options = ['formula', 'number', 'text', 'alphanumeric', 'date'], disabled = false }) {
  return (
    <div className="inline-flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt)}
          className={`rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            value === opt
              ? 'border-action bg-action text-white'
              : 'border-divider-light bg-background text-foreground hover:bg-card-hover'
          }`}
        >
          {LABELS[opt] || opt}
        </button>
      ))}
    </div>
  );
}
