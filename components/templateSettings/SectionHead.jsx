'use client';

// Title + description block above each builder section (image 2).
export default function SectionHead({ title, desc, right }) {
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
        {desc && <p className="mt-0.5 text-[13px] text-subtle">{desc}</p>}
      </div>
      {right}
    </div>
  );
}
