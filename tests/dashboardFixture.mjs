export const liveTemplates = {
  global: {
    headers: [
      { id: 'hdr_sku', name: 'SKU', type: 'text', primitive: 'sku', format: 'text' },
      { id: 'hdr_order_id', name: 'Order Id', type: 'text', format: 'text' },
      { id: 'orders', name: 'Orders', type: 'number', primitive: 'totalOrderQty', format: 'int' },
      { id: 'settlement', name: 'Settlement', type: 'number', primitive: 'settlementAmt', format: 'money' },
    ],
    tabs: [{ id: 'details', name: 'Details', headerIds: ['hdr_sku', 'orders', 'settlement'], titleCardIds: [], graphIds: [] }],
    overviewTabs: [{ id: 'overview', name: 'By SKU', hierarchyHeaderIds: ['hdr_sku'], headerIds: ['orders', 'settlement'] }],
    titleCards: [], graphs: [],
  },
  templates: [{
    id: 'fixture', marketplaceName: 'Test Marketplace',
    config: {
      marketplace: { name: 'Test Marketplace', groupByHeaderId: 'hdr_sku' },
      fileSlots: [{ id: 'orders', label: 'Orders file', mappings: [{ headerId: 'hdr_sku', sheetHeader: 'SKU' }, { headerId: 'hdr_order_id', sheetHeader: 'Order Id' }] }],
    },
  }],
};
