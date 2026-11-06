import { ACCOUNT_NAME_KEY, SKU_COST_FIELDS, isReviewField } from '@/data/fixedHeaders';
import { RESERVED_HEADER_ID_LIST } from '@/data/templateSchema';

// Where one Our Header's value comes from — the "Our Headers" column of
// Template Settings › Header (HeaderMappingTable). `mapped` = it is mapped to
// at least one marketplace sheet column. → { kind, label, detail } — `kind`
// tints the chip, `detail` is the hover text. Pure.
const COST_KEYS = new Set(SKU_COST_FIELDS.map((f) => f.key));

// "settleOrderQty" → "Settle order qty"
const words = (key) => {
  const s = String(key ?? '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export function headerSource(h, mapped = false) {
  if (h?.type === 'formula') {
    const formula = String(h.formula || '').trim();
    return formula
      ? { kind: 'formula', label: `Formula: ${formula}`, detail: `Worked out by its formula: ${formula}` }
      : { kind: 'missing', label: 'Formula (empty)', detail: 'A Formula header with no formula yet — it shows nothing.' };
  }
  if (h?.fixedKey === ACCOUNT_NAME_KEY) {
    return { kind: 'dashboard', label: 'Upload tag', detail: 'The Market Place_Brand picked on the dashboard before an upload.' };
  }
  if (isReviewField(h)) {
    return { kind: 'dashboard', label: 'Dashboard pick', detail: 'Set per order on the dashboard (Transactions page, or an Overview row for all its orders).' };
  }
  if (COST_KEYS.has(h?.fixedKey)) {
    return { kind: 'dashboard', label: 'Dashboard input', detail: 'Typed per SKU (and Account Name) in its input box on the dashboard, or filled from the SKU Cost sheet.' };
  }
  if (h?.primitive) {
    return { kind: 'engine', label: `Engine: ${words(h.primitive)}`, detail: `Worked out by the Profit & Loss engine (${h.primitive})${h.note ? ` — ${h.note}` : ''}.` };
  }
  if (mapped) {
    return { kind: 'sheet', label: 'Sheet column', detail: 'Read from the marketplace sheet column(s) it is mapped to.' };
  }
  if (RESERVED_HEADER_ID_LIST.includes(h?.id)) {
    return { kind: 'missing', label: 'Sheet column — not mapped', detail: 'Required: every marketplace must map it to a sheet column.' };
  }
  return { kind: 'missing', label: 'Not mapped yet', detail: 'Map it to a marketplace column below, or make it a Formula.' };
}
