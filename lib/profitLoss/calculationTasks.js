import { mergeUploadsAcrossSlots } from './mergeRows';
import { resolveTemplate, resolveTransactionRows } from './resolveTemplate';
import { buildExtractedSnapshot } from './extractedDataStore';
import { withSkuCosts, unitCostMap } from './skuCosts';

const priced = new WeakMap();
function pricedOptions(input) {
  let entry = priced.get(input.rows);
  if (!entry || entry.costs !== input.skuCosts) {
    entry = { costs: input.skuCosts, rows: withSkuCosts(input.rows, input.skuCosts), unitCosts: unitCostMap(input.skuCosts) };
    priced.set(input.rows, entry);
  }
  return { ...input.options, canonicalRows: entry.rows, skuCostMap: entry.unitCosts };
}

export const EMPTY_RESOLVED = { headers: [], tableRows: [], titleCardValues: {}, graphSeries: {}, overviews: {}, aggregate: {}, companyOptions: [], rowCount: 0, platforms: [] };

// Keep every header: visible formulas may depend on hidden headers. Only
// independent display outputs (cards, charts, pivots) can be omitted safely.
// `parts` = the Title Card / Graph ids the tab shows ({ titleCards, graphs }
// — its own plus any the user added: tabParts.js); without them, its own.
export function configForView(config, activeTabId, parts = null) {
  const tab = [...(config.tabs || []), ...(config.overviewTabs || [])].find((item) => item.id === activeTabId);
  const cards = new Set(parts?.titleCards || tab?.titleCardIds || []);
  const graphs = new Set(parts?.graphs || tab?.graphIds || []);
  return {
    ...config,
    titleCards: (config.titleCards || []).filter((card) => cards.has(card.id)),
    graphs: (config.graphs || []).filter((graph) => graphs.has(graph.id)),
    overviewTabs: (config.overviewTabs || []).filter((overview) => overview.id === activeTabId),
  };
}

export async function runCalculationTask(type, input) {
  switch (type) {
    case 'merge': {
      const { uploads, orderIdHeader, transactionIdHeader, headers } = input;
      const originals = new Map(uploads.flatMap((upload) => upload.rows).map((row, index) => [row, index]));
      // Return references for untouched rows. Recreating them in the browser
      // would defeat the save ledger and re-insert rows without transaction IDs.
      return mergeUploadsAcrossSlots(uploads, orderIdHeader, transactionIdHeader, headers)
        .map((row) => originals.has(row) ? originals.get(row) : row);
    }
    case 'view': {
      const { config, activeTabId, parts, transactions } = input;
      const options = pricedOptions(input);
      const emptyTransactions = { headers: config.headers || [], rows: [], rowCount: 0 };
      if (!config.headers?.length) return { resolved: EMPTY_RESOLVED, transactionResolved: emptyTransactions };
      if (transactions) {
        return {
          resolved: { ...EMPTY_RESOLVED, companyOptions: [...new Set(options.canonicalRows.map((row) => row.company).filter(Boolean))].sort() },
          transactionResolved: resolveTransactionRows(config, options),
        };
      }
      return { resolved: resolveTemplate(configForView(config, activeTabId, parts), options), transactionResolved: emptyTransactions };
    }
    case 'export':
      return {
        full: resolveTemplate(input.config, pricedOptions(input)),
        fullTransactions: input.transactions ? resolveTransactionRows(input.config, pricedOptions(input)) : { headers: [], rows: [], rowCount: 0 },
      };
    case 'snapshot': {
      const { tableRows } = resolveTemplate(input.config, { ...input.options, canonicalRows: input.rows });
      return buildExtractedSnapshot(tableRows, input.config.headers);
    }
    case 'upload': {
      const { parseAllTabs } = await import('../sheet/parseWorkbook');
      const { ingestWorkbook } = await import('./ingest');
      const workbook = await parseAllTabs(input.file, input.override);
      if (!workbook.sheetNames.length) return { ok: false, empty: true };
      return ingestWorkbook(workbook, input.options);
    }
    case 'ingest': {
      const { ingestWorkbook } = await import('./ingest');
      return ingestWorkbook(input.workbook, input.options);
    }
    case 'skuCosts': {
      const { parseSkuCostSheet } = await import('../sheet/parseWorkbook');
      return parseSkuCostSheet(input.file);
    }
    default:
      throw new Error(`Unknown calculation task: ${type}`);
  }
}
