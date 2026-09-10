'use client';

const LABELS = { formula: 'Formula', number: 'Number', text: 'Text', alphanumeric: 'Alphanumeric', graphDesign: 'Graph Design' };

// The "Formula / Number / Text / Alphanumeric" segmented control from image 2
// — green when active. Used by Header / Title Card / Graph Data.
export default function TypeToggle({ value, onChange, options = ['formula', 'number', 'text', 'alphanumeric'] }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg border border-divider bg-card p-0.5">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`rounded-md px-2.5 py-1 text-[12.5px] font-semibold transition-colors ${
            value === opt ? 'bg-action text-white shadow-sm' : 'text-subtle hover:text-foreground'
          }`}
        >
          {LABELS[opt] || opt}
        </button>
      ))}
    </div>
  );
}
