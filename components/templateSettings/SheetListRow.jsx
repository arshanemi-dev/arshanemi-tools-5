'use client';

import { FileSpreadsheet, RotateCcw } from 'lucide-react';
import { lineLabel } from '@/lib/sheet/sheetHeaders';

function Pill({ active, disabled, onClick, children }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`px-2.5 py-1 text-[11.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        active ? 'bg-action text-white' : 'bg-background text-foreground hover:bg-card-hover'
      }`}
    >
      {children}
    </button>
  );
}

// One Header Row / Value Row box: what's typed, else the auto-detected line
// as a grey placeholder; ↺ goes back to auto.
function LineBox({ value, auto, bad, disabled, onChange, label, hint }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      <input
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder={auto || '—'}
        aria-label={label}
        aria-invalid={bad || undefined}
        title={bad ? 'Not understood' : value ? hint : `Auto-detected${auto ? `: ${auto}` : ''} — type to change`}
        className={`w-20 rounded-md border bg-background px-2 py-1 text-[12px] tabular-nums focus:outline-none disabled:opacity-50 ${
          bad ? 'border-neg text-neg' : value ? 'border-action/50 focus:border-accent' : 'border-divider focus:border-accent'
        }`}
      />
      {value && !disabled ? (
        <button type="button" onClick={() => onChange('')} title="Back to auto-detect" className="rounded p-0.5 text-subtle hover:text-foreground">
          <RotateCcw size={11} />
        </button>
      ) : (
        <span className="w-[15px]" />
      )}
    </span>
  );
}

// One sheet of an uploaded file, on one line of the sheet list
// (SheetHeadersUploader): tick it to read it, Row / Column, the Header Row
// and Value Row boxes (sheetHeaders.js parseHeaderBox / valueSpecFromBox say
// what they accept), and how many headers it gives. `c` = this sheet's
// settings { include, orientation, headerText, valueText }; `r` = what
// extractSheetHeaders reads with them; `headerOk` = the Header Row box is
// understood.
export default function SheetListRow({ sheet, c, r, headerOk, isPdf, onPatch, onOrientation }) {
  const include = c.include !== false;
  const isCol = c.orientation === 'column';
  const unit = isCol ? 'column' : 'row';
  const autoHeader = r.headerIndexes?.length ? r.headerIndexes.map((n) => lineLabel(n, isCol)).join(', ') : '';
  const autoValue = r.valueFrom ? lineLabel(r.valueFrom, isCol) : '';
  return (
    <tr className={`border-t border-divider align-middle ${include ? '' : 'bg-card/50 text-subtle'}`}>
      <td className="px-3 py-2">
        <input
          type="checkbox"
          checked={include}
          onChange={(e) => onPatch({ include: e.target.checked })}
          aria-label={`Read sheet ${sheet.name}`}
          className="accent-[var(--color-action)]"
        />
      </td>
      <td className="max-w-[16rem] px-2 py-2">
        <p className="flex items-center gap-1.5 truncate text-[12.5px] font-semibold text-foreground" title={sheet.name}>
          <FileSpreadsheet size={13} className="shrink-0 text-action" /> {sheet.name}
        </p>
        <p className="text-[10.5px] text-subtle">
          {sheet.rowCount} row{sheet.rowCount === 1 ? '' : 's'} × {sheet.colCount} col{sheet.colCount === 1 ? '' : 's'}
        </p>
      </td>
      <td className="px-2 py-2">
        {!isPdf && (
          <span className="inline-flex overflow-hidden rounded-full border border-divider-light" title={isCol ? 'Headers down a column, values in the columns beside it' : 'Headers across a row, values in the rows below'}>
            <Pill active={!isCol} disabled={!include} onClick={() => onOrientation('row')}>Row</Pill>
            <Pill active={isCol} disabled={!include} onClick={() => onOrientation('column')}>Column</Pill>
          </span>
        )}
      </td>
      <td className="px-2 py-2">
        {!isPdf && (
          <LineBox
            value={c.headerText || ''}
            auto={autoHeader}
            bad={include && !headerOk}
            disabled={!include}
            onChange={(headerText) => onPatch({ headerText })}
            label={`Header ${unit} of ${sheet.name}`}
            hint={isCol ? 'Header column — e.g. A, or A, B for two' : 'Header row — e.g. 2, or 1, 2 for two'}
          />
        )}
      </td>
      <td className="px-2 py-2">
        {!isPdf && (
          <LineBox
            value={c.valueText || ''}
            auto={autoValue}
            bad={include && r.valueSpecOk === false}
            disabled={!include}
            onChange={(valueText) => onPatch({ valueText })}
            label={`Value ${unit} of ${sheet.name}`}
            hint={isCol ? 'First value column — e.g. B (to the end), or B-F' : 'First value row — e.g. 4 (to the end), or 4-200'}
          />
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right text-[11.5px]">
        {!include ? (
          <span className="text-subtle">skipped</span>
        ) : r.headers?.length ? (
          <span className="text-muted">
            <span className="font-semibold text-foreground">{r.headers.length}</span> headers · {r.dataCount} {unit}{r.dataCount === 1 ? '' : 's'}
          </span>
        ) : (
          <span className="text-neg">no header {unit} found</span>
        )}
      </td>
    </tr>
  );
}
