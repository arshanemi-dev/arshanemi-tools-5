// Reference list of the P&L engine's available base metrics
// (lib/profitLoss/engine.js) — `primitive` is the key on an engine skuRow.
// Not auto-seeded into the global config anymore (Global Settings starts
// blank; see Global Template Settings plan) — kept here as the map from
// "what the engine computes" to "what a Header's primitive can bind to"
// while building out Headers in Template Settings > Global Settings.
// Formula-type headers / title cards reference headers by `name` in
// [brackets], same as before.

export const DEFAULT_HEADERS = [
  // ── the 14 columns from the reference dashboard table (showInTable) ──
  { id: 'hdr_sku',            name: 'Sku Name',       type: 'text',   primitive: 'sku',            format: 'text',  showInTable: true },
  { id: 'hdr_total_order',    name: 'Total Order',    type: 'number', primitive: 'totalOrderQty',  format: 'int',   showInTable: true },
  { id: 'hdr_settle_order',   name: 'Settle Order',   type: 'number', primitive: 'settleOrderQty', format: 'int',   showInTable: true },
  { id: 'hdr_product_cost',   name: 'Product Cost',   type: 'number', primitive: 'productCost',    format: 'money', showInTable: true },
  { id: 'hdr_pl',             name: 'Profit/Loss',    type: 'number', primitive: 'profitLoss',     format: 'money', signed: true, showInTable: true, note: 'Settlement − Product Cost − Ads Cost' },
  { id: 'hdr_return_pct',     name: 'Return %',       type: 'number', primitive: 'returnPct',      format: 'pct',   showInTable: true },
  { id: 'hdr_cogs',           name: 'COGS',           type: 'number', primitive: 'cogs',           format: 'money', showInTable: true },
  { id: 'hdr_bank_statement', name: 'Bank Statement', type: 'number', primitive: 'bankStatement',  format: 'money', signed: true, showInTable: true },
  { id: 'hdr_ads_cost',       name: 'Ads Cost',       type: 'number', primitive: 'adsCost',        format: 'money', showInTable: true },
  { id: 'hdr_deliver',        name: 'Deliver',        type: 'number', primitive: 'deliveredQty',   format: 'int',   showInTable: true },
  { id: 'hdr_return',         name: 'Return',         type: 'number', primitive: 'returnQty',      format: 'int',   showInTable: true },
  { id: 'hdr_rto',            name: 'RTO',            type: 'number', primitive: 'rtoQty',         format: 'int',   showInTable: true },
  { id: 'hdr_exchange',       name: 'Exchange',       type: 'number', primitive: 'exchangeQty',    format: 'int',   showInTable: true },
  { id: 'hdr_canceled',       name: 'Canceled',       type: 'number', primitive: 'cancelledQty',   format: 'int',   showInTable: true },

  // ── extras available to formulas / title cards, hidden from the table by default ──
  { id: 'hdr_order_value',    name: 'Order Value',    type: 'number', primitive: 'totalOrderValue', format: 'money', showInTable: false },
  { id: 'hdr_return_value',   name: 'Return Value',   type: 'number', primitive: 'returnValue',     format: 'money', showInTable: false },
  { id: 'hdr_settlement',     name: 'Settlement',     type: 'number', primitive: 'settlementAmt',   format: 'money', signed: true, showInTable: false },
  { id: 'hdr_fees',           name: 'Fees',           type: 'number', primitive: 'fees',            format: 'money', showInTable: false },
  { id: 'hdr_taxes',          name: 'Taxes',          type: 'number', primitive: 'taxes',           format: 'money', showInTable: false },
];

// Scalar tokens injected into the AGGREGATE evaluation scope only (title
// cards, graph series, overview) — not per-row. resolveTemplate computes them.
export const AGGREGATE_BUILTINS = {
  'Ads %': 'adsPct',           // the ads percentage used for the run
  'SKU Count': 'skuCount',     // distinct groupBy keys in the filtered set
  'Settled SKU Count': 'settledSkuCount',
  'Row Count': 'rowCount',     // canonical rows in the filtered set
};
