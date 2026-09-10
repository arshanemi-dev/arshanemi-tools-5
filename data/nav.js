// Top navbar items — pixel-matches the reference dashboard's multi-tool bar
// (image 1). The Profit & Loss entry is internal + active; the rest link out
// to their Barmeto marketing pages. Override the base with
// NEXT_PUBLIC_MARKETING_URL if the site ever moves.

const SITE = (process.env.NEXT_PUBLIC_MARKETING_URL || 'https://www.barmeto.com').replace(/\/$/, '');

export const NAV_ITEMS = [
  { key: 'link-generator',     label: 'Link generator',     href: `${SITE}/tools/link-generator` },
  { key: 'background-remover',  label: 'Background remover',  href: `${SITE}/tools/background-remover` },
  { key: 'auto-listing',        label: 'Auto listing',        href: `${SITE}/tools/auto-listing` },
  { key: 'label-cropper',       label: 'Label cropper',       href: `${SITE}/tools/label-cropper` },
  { key: 'profit-loss',         label: 'Profit & loss',       href: '/profit-loss', internal: true },
  { key: 'pricing',             label: 'Pricing',             href: `${SITE}/pricing` },
  { key: 'more-tools',          label: 'More Tools',          href: `${SITE}/tools` },
  { key: 'help',                label: 'Help & support',      href: `${SITE}/contact` },
];

export const ACTIVE_NAV_KEY = 'profit-loss';
