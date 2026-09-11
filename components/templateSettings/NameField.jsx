'use client';

import { isDuplicateName } from '@/data/templateSchema';

// A name/label <input> that reddens live when it collides with another
// item's name in the same list — shared by every section with a uniqueness
// rule (Title Card, Graph, Tab, Overview Tab, Market Place files). Headers
// are deliberately excluded (see checkUniqueNames in data/templateSchema.js).
export default function NameField({ list, id, value, onChange, field = 'name', placeholder, className = '' }) {
  const dup = isDuplicateName(list, id, value, field);
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      title={dup ? `Another item already uses this ${field}` : undefined}
      className={`rounded-lg border bg-background px-3 py-1.5 text-sm font-medium focus:outline-none ${
        dup ? 'border-neg focus:border-neg' : 'border-divider focus:border-accent'
      } ${className}`}
    />
  );
}
