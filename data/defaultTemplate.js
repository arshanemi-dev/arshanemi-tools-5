// The zero-config fallback — a full `config` (data/templateSchema.js shape)
// that reproduces the reference dashboard (image 1): an 8-tab sidebar
// (Home · Order · Return · Ads ROI · Profit/Loss · Product Cost · State ·
// Order Reconciliation), the 7-card KPI band, the 14-column table, and two
// sample graphs. Used whenever no live marketplace template is published, so
// /profit-loss always works with nothing configured.
//
// Exposed in the Market Place picker with the same shape as an entry from
// GET /api/marketplace-templates/live, so the dashboard treats it uniformly.

import { CONFIG_SCHEMA_VERSION } from './templateSchema';
import { defaultHeaders } from './defaultHeaders';

const FILE_SLOTS = [
  { id: 'slot_payment', label: 'Upload Payment Sheet', kind: 'payment', required: true,  accept: '.csv,.xlsx,.xls,.pdf', multiple: true,  headerRowIndex: 1, valueRowIndex: 2, sheetNameHint: '', extractedHeaders: [], sampleValues: {}, mappings: [] },
  { id: 'slot_order',   label: 'Upload Order Sheet',   kind: 'order',   required: false, accept: '.csv,.xlsx,.xls,.pdf', multiple: false, headerRowIndex: 1, valueRowIndex: 2, sheetNameHint: '', extractedHeaders: [], sampleValues: {}, mappings: [] },
  { id: 'slot_h1',      label: 'Header 1',             kind: 'aux',     required: false, accept: '.csv,.xlsx,.xls,.pdf', multiple: true,  headerRowIndex: 1, valueRowIndex: 2, sheetNameHint: '', extractedHeaders: [], sampleValues: {}, mappings: [] },
  { id: 'slot_h2',      label: 'Header 2',             kind: 'aux',     required: false, accept: '.csv,.xlsx,.xls,.pdf', multiple: true,  headerRowIndex: 1, valueRowIndex: 2, sheetNameHint: '', extractedHeaders: [], sampleValues: {}, mappings: [] },
  { id: 'slot_h3',      label: 'Header 3',             kind: 'aux',     required: false, accept: '.csv,.xlsx,.xls,.pdf', multiple: true,  headerRowIndex: 1, valueRowIndex: 2, sheetNameHint: '', extractedHeaders: [], sampleValues: {}, mappings: [] },
];

const v = (type, formula, format) => ({ type, formula, format });

const TITLE_CARDS = [
  { id: 'tc_order',    name: 'Order',       mainValue: v('formula', '[Order Value]', 'money'),  subValue: v('formula', '[Total Order]', 'int') },
  { id: 'tc_return',   name: 'Return',      mainValue: v('formula', '[Return Value]', 'money'), subValue: v('formula', '[Return]', 'int') },
  { id: 'tc_canceled', name: 'Canceled',    mainValue: v('number', '0', 'money'),               subValue: v('formula', '[Canceled]', 'int') },
  { id: 'tc_rto',      name: 'RTO',         mainValue: v('number', '0', 'money'),               subValue: v('formula', '[RTO]', 'int') },
  { id: 'tc_ads',      name: 'Ads Cost',    mainValue: v('formula', '[Ads Cost]', 'money'),     subValue: v('formula', '[Ads %]', 'pct') },
  { id: 'tc_pl',       name: 'Profit/Loss', mainValue: v('formula', '[Profit/Loss]', 'money'),  subValue: v('formula', '[Settled SKU Count]', 'int') },
  { id: 'tc_cogs',     name: 'COGS',        mainValue: v('formula', '[COGS]', 'money'),         subValue: v('formula', '[SKU Count]', 'int') },
];

// A graph is a chart type + the "Graph Header" list it plots — one line/bar
// per header (auto-split, like the Header section's column list) or one pie
// slice per header.
const GRAPHS = [
  { id: 'g_pl_trend', name: 'Profit / Loss over time', chartType: 'line', headerIds: ['hdr_pl'] },
  { id: 'g_status_split', name: 'Order status split', chartType: 'pie', headerIds: ['hdr_deliver', 'hdr_return', 'hdr_rto', 'hdr_canceled'] },
];

const ALL_TABLE = [
  'hdr_sku', 'hdr_total_order', 'hdr_settle_order', 'hdr_product_cost', 'hdr_pl',
  'hdr_return_pct', 'hdr_cogs', 'hdr_bank_statement', 'hdr_ads_cost', 'hdr_deliver',
  'hdr_return', 'hdr_rto', 'hdr_exchange', 'hdr_canceled',
];

const tab = (id, name, icon, order, titleCardIds, graphIds, headerIds, columns = 4) => ({
  id, name, icon, order, titleCardIds, graphIds, headerIds,
  layout: { titleCards: { columns }, graphs: graphIds.map((g) => ({ id: g, span: 1 })), tableDefaultView: 'all' },
});

const TABS = [
  tab('tab_home', 'Home', 'LayoutDashboard', 0,
    ['tc_order', 'tc_return', 'tc_canceled', 'tc_rto', 'tc_ads', 'tc_pl', 'tc_cogs'],
    ['g_pl_trend', 'g_status_split'], ALL_TABLE, 7),
  tab('tab_order', 'Order', 'ShoppingCart', 1,
    ['tc_order', 'tc_canceled', 'tc_rto'], ['g_status_split'],
    ['hdr_sku', 'hdr_total_order', 'hdr_settle_order', 'hdr_deliver', 'hdr_canceled', 'hdr_rto'], 3),
  tab('tab_return', 'Return', 'Undo2', 2,
    ['tc_return', 'tc_rto'], [],
    ['hdr_sku', 'hdr_total_order', 'hdr_return', 'hdr_return_pct', 'hdr_rto', 'hdr_exchange'], 2),
  tab('tab_ads_roi', 'Ads ROI', 'TrendingUp', 3,
    ['tc_ads', 'tc_pl'], ['g_pl_trend'],
    ['hdr_sku', 'hdr_settle_order', 'hdr_ads_cost', 'hdr_bank_statement', 'hdr_pl'], 2),
  tab('tab_pl', 'Profit/Loss', 'LineChart', 4,
    ['tc_pl', 'tc_cogs', 'tc_ads'], ['g_pl_trend'], ALL_TABLE, 3),
  tab('tab_product_cost', 'Product Cost', 'Package', 5,
    ['tc_cogs'], [],
    ['hdr_sku', 'hdr_deliver', 'hdr_product_cost', 'hdr_cogs', 'hdr_pl'], 1),
  tab('tab_state', 'State', 'Map', 6,
    ['tc_order', 'tc_return'], [],
    ['hdr_sku', 'hdr_total_order', 'hdr_deliver', 'hdr_return', 'hdr_pl'], 2),
  tab('tab_reconciliation', 'Order Reconciliation', 'ClipboardCheck', 7,
    ['tc_order', 'tc_pl'], [],
    ['hdr_sku', 'hdr_total_order', 'hdr_settle_order', 'hdr_bank_statement', 'hdr_pl'], 2),
];

export const DEFAULT_CONFIG = {
  schemaVersion: CONFIG_SCHEMA_VERSION,
  marketplace: { name: 'Default', companyHeaderId: null, brandHeaderId: null, groupByHeaderId: 'hdr_sku' },
  fileSlots: FILE_SLOTS,
  headers: defaultHeaders(),
  titleCards: TITLE_CARDS,
  graphs: GRAPHS,
  tabs: TABS,
  overviewTabs: [
    {
      id: 'ov_sku', name: 'Overview', order: 0, fixedHeaderId: 'hdr_sku',
      headerIds: ['hdr_total_order', 'hdr_settlement', 'hdr_pl', 'hdr_cogs', 'hdr_ads_cost', 'hdr_return_pct'],
    },
  ],
};

// Same shape as an entry from GET /api/marketplace-templates/live.
export const DEFAULT_TEMPLATE = {
  id: '__default__',
  marketplaceName: 'Default dashboard',
  templateNumber: '—',
  isFallback: true,
  config: DEFAULT_CONFIG,
};
