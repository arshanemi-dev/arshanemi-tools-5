'use client';

import { FileSpreadsheet, ArrowRight } from 'lucide-react';

// Empty state shown before any settlement sheet is uploaded.
export default function SheetDropCard() {
  const steps = [
    'Pick your marketplace (or let it auto-detect from the file).',
    'Upload the Payment / Settlement sheet you downloaded from that seller panel.',
    'Upload a SKU Cost sheet (2 columns: SKU, Cost) — download the template if you don’t have one.',
    'Choose a date range and press Apply.',
  ];
  return (
    <div className="rounded-2xl border border-dashed border-divider-light bg-background p-8 text-center sm:p-12">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-action-soft text-action">
        <FileSpreadsheet size={26} />
      </div>
      <h2 className="mt-4 text-lg font-bold text-foreground">Upload a settlement sheet to begin</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">
        Works with Flipkart, Meesho, Amazon, Myntra and JioMart. Your files are read entirely
        in your browser — nothing is uploaded unless you sign in and save.
      </p>
      <ol className="mx-auto mt-6 max-w-md space-y-2 text-left">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-muted">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-card text-[11px] font-semibold text-foreground">
              {i + 1}
            </span>
            {s}
          </li>
        ))}
      </ol>
      <p className="mt-6 inline-flex items-center gap-1.5 text-xs font-medium text-action">
        Use the green buttons above <ArrowRight size={13} />
      </p>
    </div>
  );
}
