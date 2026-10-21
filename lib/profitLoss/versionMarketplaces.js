import { makeEmptyMarketplaceConfig, newId } from '@/data/templateSchema';

// Every marketplace — its name, its files (upload slots + per-sheet
// settings + saved sheet headers) and its column mappings — is part of the
// Global Settings VERSION, like everything Template Settings edits: the
// version's `marketplaces` = [{ id, name, templateNumber, createdAt,
// marketplace: { name, companyHeaderId, brandHeaderId, groupByHeaderId },
// fileSlots: [...] }]. Save New Version keeps them; switching a version
// Live brings back that version's marketplaces, files and mappings. A
// version saved before marketplaces were versioned has none — the editor
// then starts from the marketplace rows as they were (withVersionMarketplaces)
// and the dashboard, for such a live version, still reads those rows (the
// hub's /live `templates`). All pure.

// The marketplace rows (hub marketplace_templates, is_global = false — the
// builder's listTemplates) as version entries.
export function marketplacesFromRows(rows = []) {
  return [...rows]
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
    .map((t) => {
      const cfg = t.config && Object.keys(t.config).length ? t.config : makeEmptyMarketplaceConfig(t.marketplaceName);
      return {
        id: t.id,
        name: t.marketplaceName || cfg.marketplace?.name || 'Marketplace',
        templateNumber: t.templateNumber || '',
        createdAt: t.createdAt || null,
        marketplace: cfg.marketplace || { name: t.marketplaceName || '' },
        fileSlots: cfg.fileSlots || [],
      };
    });
}

// A version as the editor opens it: with its own marketplaces, or — one
// saved before they were versioned — the marketplace rows'. `config` itself
// when it already has them.
export function withVersionMarketplaces(config, rows = []) {
  return Array.isArray(config.marketplaces) ? config : { ...config, marketplaces: marketplacesFromRows(rows) };
}

export function makeMarketplace(name) {
  const base = makeEmptyMarketplaceConfig(name);
  return { id: newId('mp'), name, templateNumber: '', createdAt: new Date().toISOString(), marketplace: base.marketplace, fileSlots: [] };
}

// One marketplace entry's own config, in the shape a marketplace has always
// had ({ marketplace, fileSlots }) — what the Market Place section edits and
// the dashboard merges with the global headers (effectiveConfig.js).
export const marketplaceConfigOf = (entry) => ({ marketplace: entry?.marketplace || {}, fileSlots: entry?.fileSlots || [] });

// `fn(marketplaceConfig) → next marketplaceConfig` applied to one entry.
export function withMarketplaceConfig(config, id, fn) {
  return {
    ...config,
    marketplaces: (config.marketplaces || []).map((m) => {
      if (m.id !== id) return m;
      const next = fn(marketplaceConfigOf(m));
      return { ...m, marketplace: next.marketplace ?? m.marketplace, fileSlots: next.fileSlots ?? m.fileSlots };
    }),
  };
}

export const withMarketplaceAdded = (config, entry) => ({ ...config, marketplaces: [...(config.marketplaces || []), entry] });
export const withMarketplaceRenamed = (config, id, name) => ({
  ...config, marketplaces: (config.marketplaces || []).map((m) => (m.id === id ? { ...m, name } : m)),
});
export const withMarketplaceRemoved = (config, id) => ({ ...config, marketplaces: (config.marketplaces || []).filter((m) => m.id !== id) });

// The live version's marketplaces in the shape the dashboard (and the
// Header section's matrix) read a marketplace in: { id, marketplaceName,
// templateNumber, createdAt, config: { marketplace, fileSlots } }.
export const marketplaceListOf = (config) => (config?.marketplaces || []).map((m) => ({
  id: m.id, marketplaceName: m.name, templateNumber: m.templateNumber || '', createdAt: m.createdAt || null, config: marketplaceConfigOf(m),
}));
