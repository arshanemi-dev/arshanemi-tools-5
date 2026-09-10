# Feature Development Plan — Profit & Loss Tool (`tools/arshanemi-tools-5`)

> Single source of truth for **arshanemi-tools-5**, a standalone Next.js 16 (App
> Router, **JavaScript only**, Tailwind v4) app whose one product is a
> multi‑marketplace **Profit & Loss dashboard** for ecommerce sellers.
>
> Author role: **Senior Full‑Stack Developer + UI/UX**. 
>
> ---
>
> ## Rev 3 (2026‑09‑10) — Template‑driven dashboard + Template Settings builder
>
> Rev 1–2 shipped a fixed‑layout P&L dashboard (browser sheet parsing, canonical
> platform mappers, a hard‑coded 7‑KPI / 14‑column layout, hub‑owned
> `profit_loss_settings` + `profit_loss_history`). **That stays as the fallback
> engine.** Rev 3 adds the two things the user asked for:
>
> - **Task 1 — Home page (image 1):** a pixel‑match of the reference dashboard —
>   a **persistent left sidebar** (tabs + Overview + a *Template Settings* entry
>   shown only to `master_admin` / granted users), a green data‑I/O toolbar, a `Dashboard` header
>   bar (`Reset` · `Setting` · brand filter · `Date` · `Apply`), a KPI card
>   band, `My Details` / `All Details` column pills, and a filterable/sortable
>   details table. Every region is **driven by the active marketplace
>   template** — no more hard‑coded cards/columns — with the Rev‑2 layout as the
>   built‑in default when no template is live.
> - **Task 2 — Template Settings (image 2):** a builder
>   (`/profit-loss/template-settings`) reachable by **`master_admin`, or any user
>   a `master_admin` has explicitly granted** (per‑user grant flag, mirroring
>   tools‑4's `listing_template_access`), where an admin uploads a marketplace's
>   sheet(s), defines default headers + file/column mappings, extracts &
>   maps sheet headers, writes formulas, builds Title Cards, Graph Designs,
>   Graph Data, Tabs, an Overview tab, and **saves a versioned template with a
>   unique id**. Backed by 3 new hub tables (`marketplace_templates`,
>   `marketplace_template_details`, `marketplace_template_logs`) + a per‑owner
>   counter + a `user_settings.marketplace_template_access` grant column, thin
>   proxy routes in tools‑5, and a full change log.
>
> **Decisions locked (2026‑09‑10):** ① navbar **matches image 1 exactly**
> (data‑driven multi‑tool bar; CLAUDE.md "single‑product navbar" rule is
> retired). ② **one template = one marketplace** (v1). ③ Template Settings is
> **`master_admin` + individually grantable**. ④ **Company** and **Brand** are
> **two independent filters** (`config.marketplace.companyHeaderId` +
> `brandHeaderId`), AND‑applied.

---

## 0. What already exists (Rev 1–2 — do not rebuild)

| Area | Files | Status |
|---|---|---|
| Auth / OTP / profile / forgot‑reset / SSO handoff / theme / billing modals | `lib/{auth,connect,serverBilling,toolBilling,tokenStore,tokenHandoff}.js`, `components/{admin,auth,billing,profile}/*`, `app/{login,profile,forgot-password,reset-password}` | Cloned from tools‑4, working |
| Middleware + SSO | `proxy.js` (matcher `['/profit-loss/:path*','/api/:path*','/login',…]`), `app/page.js` (forwards `lt_at/lt_rt/lt_u` → `/profit-loss`) | working |
| Browser sheet parsing | `lib/sheet/{readAnyFile,parseWorkbook,parsePdf,exportRaw,skuCostTemplate}.js` | working |
| Canonical platform layer | `data/platforms/{canonical,detect,index,aliases,manual,amazon,flipkart,meesho,myntra,jiomart}.js` | working |
| P&L engine | `lib/profitLoss/{engine,dateRanges,exportDashboard,fmt}.js` | working — **becomes the "base‑metrics" provider for template formulas** |
| Fixed dashboard | `components/dashboard/{ProfitLossView,ProfitLossShell,DashboardTopbar,DashboardToolbar,DashboardHeaderBar,KpiCard,KpiCardRow,DetailsTable,ColumnHeaderCell,DetailsViewPills,DateRangeFilter,PlatformFilter,AdsCostControl,HistoryDrawer,SaveRunButton,RawRowsTable,SheetSettingsPanel,MarketplacePicker,PlatformBadge}.jsx`; Redux `store/sheetSettingsSlice.js` | working — **refactored into a template‑aware renderer in Task 1** |
| Per‑user persistence | hub `scripts/profit_loss_migration.sql`, `app/api/profit-loss/{settings,history,history/[id]}` on both sides, `lib/db.js` `*ProfitLoss*` fns | working — unchanged |

**Reference material studied for Rev 3:** tools‑4's whole template system —
`components/listing/{TemplateSettingsWizard,NewTemplateDesign,GroupTabsStep,SheetGrid,formula,linkedHeaders,TemplateHistoryPanel,ListingToolsSidebar,ListingToolsShell}.jsx`,
`app/listing-tools/{layout,template-settings/**,template-access}`,
`lib/{listingTemplateAccess,connect}.js`; hub
`scripts/{listing_templates,listing_tools,listing_template_access,settings_access}_migration.sql`,
`app/api/listing-tools/templates/**`, `lib/db.js` `*ListingTemplate*` fns,
`lib/permissions.js`, `app/settings/layout.js`. The Rev‑3 builder is the P&L
analogue of that flow.

---

## 1. Rules (hard constraints — carried from CLAUDE.md, extended for Rev 3)

1. **JavaScript only** — `.jsx` / `.js`. No TypeScript.
2. **Tailwind v4 only** — tokens in `app/globals.css` `@theme {}`. No `style={{}}`, no CSS Modules. Use the existing token set (`bg-surface`, `bg-card`, `bg-footer`, `text-muted`, `text-accent`, `text-action`, `border-divider`, `text-pos`/`text-neg`, `--radius-*`). No off‑token hex.
3. **The tool app never touches Postgres.** Every template read/write proxies to the admin panel via `proxyAdminCall(path, { authHeader: authHeaderFrom(req) })`, exactly like `/api/profit-loss/settings`. The hub's `lib/db.js` + Supabase service‑role client is the only DB writer.
4. **camelCase on the wire, snake_case in the DB** — mapping only inside hub `lib/db.js`.
5. **`export const runtime = 'nodejs'`** on every new route handler.
6. **Never `eval()` / `new Function()` on template formulas** — reuse the recursive‑descent parser from tools‑4 `components/listing/formula.js` (ported to `lib/profitLoss/formula.js`).
7. **400 LOC ceiling per file; one concern per file.** Split the builder into one component per section (`components/templateSettings/*`).
8. **No login to *use* the dashboard.** `/profit-loss` renders for anonymous visitors against live templates (or the built‑in default). Login unlocks `My Details` + `History`. **Template Settings is reachable by `master_admin` or a granted user** (`user_settings.marketplace_template_access`) — server‑gated layout + hidden nav, same double gate as tools‑4's `listing_template_access`.
9. **Mobile‑first.** Sidebar collapses to an off‑canvas drawer < `lg`; the details table and graph strip scroll inside their own `overflow-x-auto` boxes; the page body never scrolls sideways.
10. **A missing template must never break the page** — the dashboard always has a working fallback config (`data/defaultTemplate.js`).
11. **The top navbar matches image 1** — a data‑driven multi‑tool bar (`data/nav.js`). CLAUDE.md's "single‑product navbar" rule is superseded; update it during milestone 10.

---

## 2. Architecture at a glance

```mermaid
flowchart TD
    subgraph Admin["Template Settings — master_admin or granted (tools-5)"]
      TS[/profit-loss/template-settings/] --> TSNew[Builder: /new or /[id]]
      TSNew -->|"POST/PUT/PATCH proxy"| HubTpl
    end
    subgraph Hub["admin-pannels (Postgres / Supabase)"]
      HubTpl[["/api/marketplace-templates/**"]] --> DB[(marketplace_templates<br/>marketplace_template_details<br/>marketplace_template_logs)]
    end
    subgraph Dash["Dashboard — anyone (tools-5)"]
      D[/profit-loss/] -->|"GET /api/marketplace-templates/live (proxy, no auth)"| HubTpl
      D --> Cfg{live template<br/>for picked marketplace?}
      Cfg -- yes --> Render[Sidebar = config.tabs + Overview<br/>KPI band = tab.titleCards<br/>Graph strip = tab.graphs<br/>Table = tab.headers]
      Cfg -- no --> Fallback[data/defaultTemplate.js<br/>= Rev-2 fixed layout]
      Render --> Engine[lib/profitLoss/engine.js base metrics<br/>+ formula.js evaluates every header/card/graph value]
      Fallback --> Engine
      Engine --> Export[Export current tab → Excel / PDF]
    end
```

**Core idea:** a *marketplace template* is a JSON `config` (stored version‑wise
in `marketplace_template_details.config`) that fully describes one marketplace's
dashboard: its upload slots, its column→field mappings, its header list &
formulas, its Title Cards, its Graphs, and its Tabs. The dashboard is a **pure
renderer** of that config; the Rev‑2 engine only supplies the **base numeric
metrics** every formula is written against.

---

## 3. The `config` schema (the heart of Rev 3)

Stored at `marketplace_template_details.config` (JSONB). Every id is a short
nanoid string generated client‑side. Authored in `data/templateSchema.js`
(shape + `makeEmptyConfig()` + `validateConfig()` + `CONFIG_VERSION`).

```jsonc
{
  "schemaVersion": 1,
  "marketplace": {
    "name": "Meesho",
    "companyHeaderId": "hdr_company",       // feeds the header-bar "All Companies ▾" filter (nullable)
    "brandHeaderId": "hdr_brand",           // feeds the toolbar "Select Brand ▾" filter (nullable)
    "groupByHeaderId": "hdr_sku"            // table row granularity — defaults to the SKU header
  },

  // ── "Market Place" section — the green upload buttons + column mapping ──
  "fileSlots": [
    {
      "id": "slot_payment", "label": "Upload Payment Sheet", "kind": "payment",
      "required": true, "accept": ".csv,.xlsx,.xls,.pdf", "multiple": true,
      "headerRowIndex": 1,                 // 1-based, user-set in the builder
      "sheetNameHint": "Sheet1",
      "extractedHeaders": ["Sub_Order_ID","SKU","Net_Payout", "..."],   // snapshot from the uploaded sample
      "sampleValues": { "SKU": ["MEE-001","MEE-002"] },
      "mappings": [                        // sheet header  ->  our default header
        { "sheetHeader": "SKU",        "headerId": "hdr_sku" },
        { "sheetHeader": "Net_Payout", "headerId": "hdr_settlement" }
      ]
    },
    { "id": "slot_order",  "label": "Upload Order Sheet", "kind": "order",  "required": false, "...": "..." },
    { "id": "slot_h1", "label": "Header 1", "kind": "aux", "...": "..." },
    { "id": "slot_h2", "label": "Header 2", "kind": "aux", "...": "..." },
    { "id": "slot_h3", "label": "Header 3", "kind": "aux", "...": "..." }
  ],

  // ── "Header" section — default (canonical) headers + extracted + manual ──
  "headers": [
    {
      "id": "hdr_settlement", "name": "Bank Statement",
      "type": "number",                   // formula | number | text | alphanumeric
      "formula": "",                      // when type = formula, references others by [Name]
      "source": "default",                // default | extracted | manual
      "mappedFrom": { "slot": "slot_payment", "sheetHeader": "Net_Payout" },  // or null
      "primitive": "settlementAmt",       // default headers bind to an engine base metric
      "note": "Amount actually credited to your bank",
      "format": "money",                  // money | int | pct | text
      "showInTable": true
    },
    {
      "id": "hdr_pl", "name": "Profit/Loss", "type": "formula",
      "formula": "[Bank Statement] - [Product Cost] - [Ads Cost]",
      "source": "default", "format": "money", "signed": true, "showInTable": true
    }
    // extracted-but-unmapped sheet headers are appended here with source:"extracted";
    // a sheet header that IS mapped to a default header is NOT added (union rule, §5.2)
  ],

  // ── "Title Card" section — one name + two independently-formula'd values ──
  "titleCards": [
    {
      "id": "tc_order", "name": "Order",
      "mainValue": { "type": "formula", "formula": "[Total Order]",     "format": "money" },
      "subValue":  { "type": "formula", "formula": "[Total Order Qty]",  "format": "int" }
    }
  ],

  // ── "Graph Design" section — reusable chart shells ──
  "graphDesigns": [
    { "id": "gd_line", "name": "Trend", "chartType": "line" },   // line | bar | area | pie
    { "id": "gd_pie",  "name": "Split", "chartType": "pie" }
  ],

  // ── "Graph Data" section — binds data to a Graph Design ──
  "graphData": [
    {
      "id": "g_pl_trend", "name": "P/L over time",
      "type": "formula",                  // formula | number | text | graphDesign
      "graphDesignId": "gd_line",
      "series": [
        // non-pie: exactly ONE series; series[0].value is the measure,
        // series[0].category ("times") is always the x-axis bucket
        { "title": "Profit/Loss", "value": { "type": "formula", "formula": "[Profit/Loss]" },
          "category": { "type": "times", "unit": "day" } }
      ]
    },
    {
      "id": "g_status_split", "name": "Status split",
      "type": "formula", "graphDesignId": "gd_pie",
      "series": [                          // pie: MIN 2 title/value pairs, each formula-driven
        { "title": "Delivered", "value": { "type": "formula", "formula": "[Deliver]" } },
        { "title": "Return",    "value": { "type": "formula", "formula": "[Return]" } },
        { "title": "RTO",       "value": { "type": "formula", "formula": "[RTO]" } }
      ]
    }
  ],

  // ── "Tab" section — the sidebar entries + per-tab layout ──
  "tabs": [
    {
      "id": "tab_home", "name": "Home", "order": 0, "icon": "LayoutDashboard",
      "titleCardIds": ["tc_order","tc_return","tc_canceled","tc_rto","tc_ads","tc_pl","tc_cogs"],
      "graphIds": ["g_pl_trend","g_status_split"],
      "headerIds": ["hdr_sku","hdr_total_order","hdr_settle_order","hdr_product_cost",
                    "hdr_pl","hdr_return_pct","hdr_cogs","hdr_settlement","hdr_ads",
                    "hdr_deliver","hdr_return","hdr_rto","hdr_exchange","hdr_canceled"],
      "layout": {
        "titleCards": { "columns": 7 },   // grid width; ids order = titleCardIds order
        "graphs": [ { "id": "g_pl_trend", "span": 2 }, { "id": "g_status_split", "span": 1 } ],
        "tableDefaultView": "all"         // "all" | "my"
      }
    }
    // Order, Return, Ads ROI, Profit/Loss, Product Cost, State, Order Reconciliation …
  ],

  // ── "Overview Tab" section — the "Header Wise Overview" cross-tab summary ──
  "overviewTab": {
    "enabled": true, "name": "Overview",
    "headerIds": ["hdr_total_order","hdr_settlement","hdr_pl","hdr_cogs","hdr_ads","hdr_return_pct"]
  },

  // ── show/hide toggles (the "add" buttons at the bottom of image 2) ──
  "visibility": {
    "marketplaceInSidebar": true,         // hide the whole marketplace from users
    "tabs": { "tab_home": true, "tab_order": true }   // per-tab show/hide in the user sidebar
  }
}
```

**Built‑in fallback** (`data/defaultTemplate.js`) is exactly this shape,
pre‑filled to reproduce image 1: 8 tabs (`Home, Order, Return, Ads ROI,
Profit/Loss, Product Cost, State, Order Reconciliation`), 7 Title Cards
(`Order, Return, Canceled, RTO, Ads Cost, Profit/Loss, COGS`), the 14 table
headers from `data/platforms/canonical.js` `SKU_COLUMNS`, and 2 sample graphs.
It is used whenever no live template exists for the picked marketplace.

---

## 4. Task 1 — Home page & sidebar (pixel‑match of image 1)

### 4.1 Layout anatomy (top → bottom, left → right)

| Region | Source in image 1 | Component | Notes |
|---|---|---|---|
| **Top nav band** (dark navy) | logo · `Link generator` `Background remover` `Auto listing` `Label cropper` `Profit & loss` `Pricing` `More Tools` `Help & support` · `Log in` | `DashboardTopbar.jsx` (**modified**) | Data‑driven from `data/nav.js` (**locked decision ①**). `Profit & loss` is the active item. Sibling links resolve to hub tool URLs from `NEXT_PUBLIC_*`, else `#`. CLAUDE.md's "single‑product navbar" rule is retired (milestone 10). Right side keeps the existing `UserMenu` / `Log in` button. |
| **Left sidebar** (white, fixed, `w-56` / `lg:w-52`) | search box · `Reset` · ⚙ · nav list (`Home` active as a dark filled pill) | `DashboardSidebar.jsx` (**new**) | Items = `visibleTabs(config)` → `Overview` (if `overviewTab.enabled`) → `Template Settings` (**only when `role==='master_admin'` or `templateSettingsAllowed`**, §5.1). ⚙ icon = jump to Template Settings for those users, a no‑op tooltip otherwise. `Search Folder…` filters the nav list live. `Reset` clears the active tab + filters. Off‑canvas drawer < `lg` (reuse tools‑4 `ListingToolsSidebar` drawer pattern + `DashboardTopbar` hamburger). |
| **Green toolbar row** | `Market Place ▾` `Select Brand ▾` `Upload Payment Sheet` `Upload Order Sheet` `Header 1` `Header 2` `Header 3` `Download SKU Cost` `Upload SKU Cost` | `DashboardToolbar.jsx` (**rewritten**) | `Market Place ▾` = `MarketplacePicker` listing live templates + built‑in default. `Select Brand ▾` = `BrandFilter` — distinct values of `config.marketplace.brandHeaderId` (**locked decision ④: independent of the Company filter**). Upload buttons are generated from `config.fileSlots` (label + accept + multiple straight from the slot). `Download/Upload SKU Cost` unchanged (`skuCostTemplate.js`). Buttons: `bg-action` pill, `text-white`, leading Lucide icon — matches the screenshot's green. |
| **Header bar** | `Dashboard` title · `Reset` `Setting` `All Compay ▾` `Date ▾` `Apply` | `DashboardHeaderBar.jsx` (**modified**) | `Setting` → `/profit-loss/template-settings` (rendered only for `master_admin` / granted; hidden otherwise). `All Compay ▾` = `CompanyFilter` — distinct values of `config.marketplace.companyHeaderId`, label **"All Companies"** (**locked decision ④: a separate dimension from Brand; both AND‑applied to the dataset**). `Date ▾` = existing `DateRangeFilter` (1 Month / 6 Months / 1 Year / Custom from–to). `Apply` = existing pending→applied commit. `Reset` mirrors the sidebar `Reset`. Add `Excel` / `PDF` / `History` / `Save` on the far right (already present in Rev 2). |
| **KPI card band** | 7 cards, each: small label + secondary metric top‑row, big ₹ figure | `KpiCardRow.jsx` + `KpiCard.jsx` (**modified**) | Cards = the **active tab's Title Cards** (`tab.titleCardIds` → `config.titleCards`). `KpiCard` renders `name`, `subValue` (top‑right, formatted per `subValue.format`), `mainValue` (big, `text-neg` when `signed` & negative). Horizontal scroll < `xl`; grid `xl:grid-cols-N` where `N = layout.titleCards.columns`. Card horizontal scroller matches the screenshot's partially‑clipped "COGS" card. |
| **Graph strip** (new — implied by image 2's Graph sections) | — | `GraphStrip.jsx` + `TemplateChart.jsx` (**new**) | Renders `tab.graphIds` → `config.graphData` in `tab.layout.graphs` order/spans. **No new dependency** — charts are hand‑drawn inline SVG (line/bar/area/pie) in `TemplateChart.jsx` (≤ 200 LOC, theme‑token colors, `overflow-x-auto`). Hidden when the tab has no graphs (fallback default `Home` tab ships 2). |
| **View pills** | `My Details ▾` `All Details ▾` | `DetailsViewPills.jsx` (**modified**) | `All` = every `header` with `showInTable`. `My` = the user's saved subset (`/api/profit-loss/settings` `headers`, already wired). Checklist options come from the **active tab's headers**, not the static `SKU_COLUMNS`. |
| **Details table** | `Sku Name` + metric columns, per‑column filter + sort icons, row checkboxes, `select all` | `DetailsTable.jsx` + `ColumnHeaderCell.jsx` (**modified**) | Columns = active tab's headers (My/All). One row per `groupByHeaderId` value. Cell value = `format(evaluate(header, rowScope))`. Sticky first column, `overflow-x-auto`, zebra, `bg-card-hover` hover — already built; only the column source changes. |
| **Overview tab** | image 2 "Header Wise Overview" | `OverviewTab.jsx` (**new**) | A single wide table: one row per `groupByHeaderId` value, columns = `overviewTab.headerIds` **unioned across every visible tab's dataset** (i.e. computed over all uploads, not one tab's filter). Also gets Excel/PDF export. |

### 4.2 Component tree

```
app/profit-loss/page.js  (server shell — unchanged: StoreProvider > ToastProvider > ProfitLossShell)
└─ ProfitLossShell.jsx  (client — MODIFIED: owns user/session; now also fetches live templates once)
   ├─ DashboardTopbar.jsx          MODIFIED  (data-driven multi-tool nav)
   └─ DashboardWorkspace.jsx       NEW  (replaces the single <ProfitLossView/> body)
      ├─ DashboardSidebar.jsx      NEW
      └─ <main>
         ├─ DashboardToolbar.jsx   REWRITTEN  (slots from config.fileSlots)
         │  ├─ MarketplacePicker.jsx   MODIFIED  (lists live templates)
         │  └─ BrandFilter.jsx         NEW  (config.marketplace.brandHeaderId)
         ├─ DashboardHeaderBar.jsx MODIFIED
         │  ├─ CompanyFilter.jsx       NEW  ("All Companies ▾" — config.marketplace.companyHeaderId)
         │  ├─ DateRangeFilter.jsx / AdsCostControl.jsx / SaveRunButton.jsx / HistoryDrawer trigger   REUSED
         ├─ TabView.jsx            NEW  (renders one config.tab OR the Overview tab)
         │  ├─ KpiCardRow.jsx > KpiCard.jsx        MODIFIED
         │  ├─ GraphStrip.jsx > TemplateChart.jsx  NEW
         │  ├─ DetailsViewPills.jsx                MODIFIED
         │  └─ DetailsTable.jsx > ColumnHeaderCell.jsx   MODIFIED
         ├─ OverviewTab.jsx        NEW
         ├─ SheetSettingsPanel.jsx REUSED  (per-file tab/column overrides — still available)
         └─ HistoryDrawer.jsx / RawRowsTable.jsx  REUSED
```

State lives in `DashboardWorkspace.jsx`: `liveTemplates[]`, `activeTemplateId`,
`config` (resolved: live or fallback), `activeTabId`, `uploads[]` (keyed by
`fileSlot.id`), `skuCost`, `pending`/`applied` filters (date, **company**,
**brand**, ads — company and brand are independent selects, both AND‑applied by
`resolveTemplate` before aggregation), `viewMode`, plus the memoised
**`dataset`** — canonical rows → engine base metrics → per‑`groupBy` row scopes
→ evaluated headers. Redux `sheetSettingsSlice` keeps the per‑file parse
overrides (unchanged).

### 4.3 Template‑driven render pipeline

```
uploads[] (per fileSlot)  ──parseWorkbook/readAnyFile──▶  rawRows per slot
        │
        ├─ mapping: config.fileSlots[].mappings + config.headers  ──▶  normalized rows
        │      (a mapped sheetHeader fills its target header.id; unmapped extracted
        │       headers fill their own header.id verbatim)
        ▼
lib/profitLoss/engine.js  ──▶  base metrics per groupBy key
        │   { deliveredQty, returnQty, rtoQty, cancelledQty, exchangeQty, pendingQty,
        │     totalOrderQty, grossSale, settlementAmt, shippingCredit, productCost,
        │     adsCost, fees.*, taxes.*, skuCount, ... }   (Rev-2 engine, lightly generalised)
        ▼
lib/profitLoss/resolveTemplate.js  (NEW)
        │   0. filter rows: date range ∧ company (companyHeaderId value) ∧ brand
        │      (brandHeaderId value) ∧ platform — all independent, all AND
        │   1. bind default headers to their `primitive`
        │   2. topologically sort formula headers, cycle-guard, evaluate row-context
        │   3. aggregate column totals across the filtered rows
        │   4. evaluate Title Card mainValue/subValue (aggregate context)
        │   5. evaluate each Graph Data series (aggregate, or time-bucketed for "times")
        ▼
{ tableRows[], titleCardValues{}, graphSeries{}, overviewRows[] }  ──▶  render
```

`resolveTemplate.js` is pure and unit‑testable against `source/samples/*.csv` +
`data/defaultTemplate.js`.

### 4.4 Export

`lib/profitLoss/exportDashboard.js` (**extended**): given the resolved
`{ titleCardValues, tableRows, columns, graphSeries, label }` → `.xlsx`
(exceljs — one sheet: Title Cards block, then the table; one sheet per graph's
series) and `.pdf` (jspdf + autotable — cards as a header grid, then the
table). Overview tab exports the same way. Buttons already on
`DashboardHeaderBar`.

---

## 5. Task 2 — Template Settings builder (pixel‑match of image 2)

### 5.1 Routes, access gate, shell

```
/profit-loss/template-settings           list page         NEW   master_admin OR granted
/profit-loss/template-settings/new        builder (create) NEW   master_admin OR granted
/profit-loss/template-settings/[id]       builder (edit)   NEW   master_admin OR granted (own template)
/profit-loss/template-access              grant screen     NEW   master_admin only
```

**Access model (locked decision ③) — mirrors tools‑4's `listing_template_access`
exactly:**

- **Grant column:** `user_settings.marketplace_template_access BOOLEAN NOT NULL
  DEFAULT FALSE` (migration in §6). `NULL`/absent behaves as `FALSE` — nobody
  reaches Template Settings until a `master_admin` flips it on for them (or they
  *are* `master_admin`). Same "off until explicitly granted" default and
  metadata‑only `ALTER` as `listing_template_access_migration.sql`.
- **`lib/marketplaceTemplateAccess.js`** (tools‑5, ported from tools‑4's
  `lib/listingTemplateAccess.js`): `fetchTemplateSettingsAllowed(token, role)` →
  `true` if `role === 'master_admin'`, else `proxyAdminCall('/api/marketplace-template-access/me', { authHeader: 'Bearer '+token })` → `!!data.allowed`. Fails closed.
- **`app/profit-loss/template-settings/layout.js`** (**new**) — covers
  list / new / [id] in one place, copied from tools‑4's
  `template-settings/layout.js`: read cookie → `verifyToken` → if
  `payload && payload.role !== 'master_admin'` → `allowed =
  fetchTemplateSettingsAllowed(token, role)` → `if (!allowed) redirect('/profit-loss')`.
  A missing payload is **not** redirected (SSO‑handoff cookie may not be set
  yet); the page's own API calls 401 → `LoginRequiredModal`.
- **`app/profit-loss/template-access/page.js`** (**new**, `master_admin` only —
  its own inline gate + hidden nav entry) — `TemplateAccessPanel.jsx` ported
  from tools‑4: lists users, per‑user on/off toggle → `PUT
  /api/marketplace-template-access` `{ userId, allowed }`.
- **Sidebar** (`DashboardWorkspace`/`DashboardSidebar`, `ListingToolsShell`
  pattern): the layout passes `initialTemplateSettingsAllowed` (server‑resolved);
  the client shell re‑checks via `/api/marketplace-template-access/me` after the
  SSO handoff settles. `Template Settings` entry shown when `role ===
  'master_admin' || templateSettingsAllowed`; `Template Access` entry shown only
  for `master_admin`.
- **Ownership:** templates carry `owner_id`. `master_admin` sees/edits **all**
  (`?scope=all`); a granted user sees/edits **only their own**. `/live` is
  global regardless of owner. Every write route enforces
  `master_admin || (granted && row.owner_id === payload.userId)` → `403`.
- The builder itself is one scrolling page with a **sticky top pill‑nav**
  (jump anchors) in image‑2 order: `Tab · Market Place · Title Card · Header ·
  Graph Design · Graph Data · Version Page`. Body sections are **always
  rendered** (tools‑4 "show the whole flow up front" pattern) in the image‑2
  body order below. A right‑docked **History panel** (`TemplateLogPanel.jsx`)
  shows the change log.

### 5.2 Sections (image‑2 body order), each spec'd

#### A. `Header` — `HeaderSection.jsx`
Reproduces image 2's Header block: left = a searchable list (`Header 2`,
`Header 3`, …) with **`+ Add New Header`**; right = the editor.

- **Name** input + `Edit` / `Delete` / `Save` pill buttons (blue / red / green,
  matching the screenshot).
- **Type** segmented control: `Formula` · `Number` · `Text` · `Alphanumeric`
  (green when active).
- **Header List** dropdown + `Copy` / `Post` — pick another header to reference;
  `Copy` copies its `[Name]` token, `Post` inserts it into the formula at the
  caret.
- **Formula builder** — a token row `+  -  /  ( )  %  Text` (buttons that append
  to the formula string) + a free text input (`ed.abc&123*dss` placeholder).
  Helper line: *"Reference other columns by name in brackets. Supports
  +,-,/,\* (or the word "power"), and parentheses."* Live‑previews the result
  against sample data.
- Only shown when `type === 'formula'`.
- **Default headers** (`source:"default"`) are seeded from
  `data/defaultHeaders.js` — the P&L primitives + image‑1's 14 table columns,
  each bound to an engine base metric (`primitive`) or a starter formula. They
  can be renamed / re‑formulated but not deleted (delete → toast, like tools‑4
  default headers).
- **Union rule (the user's core requirement):** the template's final header
  list =
  `defaultHeaders ∪ manualHeaders ∪ { extracted sheet headers with NO mapping }`.
  The moment a sheet header is mapped to a default header in the *Market Place*
  section, it is **removed** from the "unmapped / extracted" pool and never
  appears as its own header. `HeaderSection` shows three groups: **Default**,
  **Extracted (unmapped)**, **Added by me** — with counts.

#### B. `Title Card` — `TitleCardSection.jsx`
Left list (`Title Card 1/2/3`) + `+`; right editor:
- **Name** input + `Edit`/`Delete`/`Save`.
- **Add Main Value** — Type segmented (`Formula`/`Number`/`Text`/`Alphanumeric`)
  + `Header List` dropdown + `Copy`/`Post` + the same `+ - / ( ) % Text` formula
  row + text input + helper line.
- **Add Sub Value** — an identical, **independent** editor block (its own type +
  its own formula), exactly as the screenshot shows two side‑by‑side value
  editors.
- Persists to `config.titleCards[]` as `{ id, name, mainValue, subValue }`.

#### C. `Graph Design` — `GraphDesignSection.jsx`
Left list (`Graph Design 1/2/3`) + `+`; right = **Name** input +
`Edit`/`Delete`/`Save` + a 4‑tile chooser: **Line chart · Bar chart · Aria
chart · Pie chart** (note the screenshot's "Aria" = **Area**; label it "Area
chart"). Persists `{ id, name, chartType }`.

#### D. `Graph Data` — `GraphDataSection.jsx`
Left list (`Graph 1/2/3`) + `+`; right editor:
- **Name** + `Edit`/`Delete`/`Save`.
- **Type** segmented: `Formula` · `Number` · `Text` · `Graph Design`.
- `Header List` dropdown + `Copy`/`Post` + the `+ - / ( ) %` formula row + text
  input + helper line (same builder as everywhere).
- **Graph Design** picker (which `graphDesigns[]` shell to bind to).
- **Series editor**, gated on the bound design's `chartType`:
  - **Pie** → **≥ 2** title/value pairs, each with its **own formula**
    (`series[].title` + `series[].value.formula`). "Add pair" / "remove pair"
    buttons; Save disabled with < 2 pairs.
  - **Line / Bar / Area** → **exactly 1** pair: one `title` + one
    `value` (formula) as the measure, and the **second axis is always
    `"times"`** — a fixed time bucket (`day` / `week` / `month`, default
    `day`) rendered on the x‑axis. UI shows the measure editor + a small
    `times: [day▾]` control, no free formula for the second axis.
- Persists to `config.graphData[]`.

#### E. `Tab` — `TabSection.jsx`
Left list (`Tab 1/2/3`) + **`+ Add New Tab`**; right editor reproduces image 2's
Tab block:
- **Name** input + `Add Title Card` `Add New Header` `Add Graph` +
  `Edit`/`Delete`/`Save`.
- **Graph row** — up to 4 `Graph ▾` slots; each picks a `graphData[]` entry;
  drag to reorder; `–` removes; a `span` control (1–2 grid columns).
- **Title Card row** — `Add Title Card ▾` slots; pick `titleCards[]`; reorder;
  remove; the grid‑`columns` control sets `layout.titleCards.columns`.
- **Header row** — a horizontal strip of `Add Header ▾` pickers (image 2 shows
  ~8) selecting `headers[]` in display order; reorder; remove. This is the
  tab's table column set + order.
- Persists `{ id, name, order, icon, titleCardIds, graphIds, headerIds, layout }`.
- **Show/hide** — each Tab row in the left list has an **on/off toggle**
  (`visibility.tabs[tabId]`) = "show / hide from the users' sidebar".

#### F. `Overview Tab` — `OverviewTabSection.jsx`
Image 2's "Overview Tab" block: **Name** input + `+ Add New Header` +
`Edit`/`Delete`/`Save`, then **"Header Wise Overview"** + a strip of
`Add Header ▾` pickers. Persists `config.overviewTab = { enabled, name,
headerIds }`. A master toggle enables/disables the Overview entry in the user
sidebar.

#### G. `Market Place` — `MarketPlaceSection.jsx`
Image 2's "Market Place" block — the **first** thing an admin fills, even though
it sits lower in the body:
- Left list of marketplaces (`Market Place`, `Market Place 2`, …) + `+` — **one
  template = one marketplace** (locked decision ②), so this list is the
  template's own name only; multi‑marketplace templates are a later revision.
- **Name** dropdown + `Edit`/`Delete`/`Save` + **`Add File`**.
- **File slots** — a horizontal set of file cards (`File`, `File`, …) each with
  a checkbox (include), an **`Upload File`** button, a **`Sheet 1 ▾`** picker
  (which workbook tab), and paired **`Header` / `Value`** row‑index inputs
  (`Header` = header row, `Value` = first data row). Maps to
  `config.fileSlots[]` — the same slots that become the dashboard's green
  upload buttons. The admin uploads a **sample** file here purely to extract
  headers + sample values (persisted into the slot; the raw file is **not**
  required to be stored — optional Blob upload behind `Q4`).
- **Column mapping grid** — three columns exactly as the screenshot:
  - **Unmap Header** — every extracted sheet header not yet mapped, each with a
    `+` (map it).
  - **Our Header** — a `▾` dropdown of our default headers (from
    `config.headers` where `source === 'default'`, plus any manual header).
  - **Map Header** — the committed `sheetHeader → ourHeader` pairs, each with a
    `–` (unmap).
  - Two search boxes filter the left and right lists.
  - Committing a mapping writes `fileSlots[].mappings[]` **and** removes that
    sheet header from `HeaderSection`'s "Extracted (unmapped)" group (§5.2 union
    rule). Unmapping restores it.

#### H. `Version Page` — `VersionSection.jsx`
Image 2's "Version Page" block — a table with a **search** box and columns
**`Version Number` · `Sub Version Number` · `Create date` · `Live date`**, plus
a leading **on / off** toggle per row (the live pointer). Rows come from
`marketplace_template_details` for this template. Behaviour:
- **Save** (green, page footer) → writes the current builder state as a
  **draft**: if editing an existing draft, `PUT` overwrites it; otherwise
  `POST` a new row with `sub_version_number = max(sub)+1` for the current
  `version_number`. Live rows are **immutable** — saving over a live version
  forks a new draft.
- **"Save as new major version"** → `version_number = max(version)+1`,
  `sub_version_number = 1`.
- The **on toggle** on a row = **Publish**: that `marketplace_template_details`
  row → `status='live'`, the previously‑live row → `status='archived'`,
  `marketplace_templates.live_version_id` / `is_live` / `last_published_at`
  updated, and a `version.publish` log row written. Turning it **off** →
  unpublish (marketplace disappears from user dashboards; `is_live=false`).
- `Create date` = `created_at`; `Live date` = `published_at`.
- Every template shows its **unique id** (`marketplace_templates.id`) at the top
  of the builder and in the list page, copy‑to‑clipboard.

### 5.3 List page — `app/profit-loss/template-settings/page.js`

`TemplateSettingsList.jsx`: search + **`+ New Template`**. One row per
`marketplace_templates`:

| Column | Source |
|---|---|
| Marketplace name + `id` (copyable) + `template_number` (`MPT-0001`) | `marketplace_templates` |
| Live version | `live_version_id` → `v{version}.{sub}` badge, or `— draft` |
| **Last update** | `updated_at` (any draft save / rename / mapping edit) |
| **Live date** | `last_published_at` |
| Show in sidebar | `visibility.marketplaceInSidebar` toggle (writes `PATCH …/[id]`) |
| Actions | `Open` (builder) · `Logs` (drawer → `GET …/[id]/logs`) · `Duplicate` · `Delete` (confirm) |

`Logs` drawer = `TemplateLogPanel.jsx` — reverse‑chron list of
`marketplace_template_logs` (`action`, `actor_name`, `created_at`, a one‑line
`detail` summary). Same panel is docked in the builder.

### 5.4 Builder shared pieces

- `FormulaEditor.jsx` — the `+ - / ( ) % Text` token row + `Header List`
  dropdown + `Copy`/`Post` + text input + live preview + helper line. Used by
  Header / Title Card (×2) / Graph Data. ~140 LOC.
- `TypeToggle.jsx` — `Formula / Number / Text / Alphanumeric` (or
  `+ Graph Design`) segmented control. ~40 LOC.
- `ListEditorColumn.jsx` — the recurring "searchable left list + `+` add +
  select" pattern (Header/Title Card/Graph Design/Graph Data/Tab/Marketplace).
  ~90 LOC.
- `HeaderPickerStrip.jsx` — the `Add Header ▾` horizontal reorderable strip
  (Tab + Overview). ~90 LOC.
- `useTemplateDraft.js` — hook owning the whole `config` draft, `dirty` flag,
  `validateConfig()`, autosave‑to‑`localStorage` (crash recovery), and the
  save/publish calls. ~160 LOC.

---

## 6. Database schema (hub — `admin-pannels`)

New migration **`scripts/marketplace_templates_migration.sql`** (safe to
re‑run, additive). Mirrors `listing_templates_migration.sql`'s conventions
(nanoid string PK, `owner_id UUID REFERENCES users(id) ON DELETE CASCADE`,
per‑owner counter, RLS "service role manages").

```sql
-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Marketplace Templates for the Profit & Loss tool (tools-5).
-- Backs /api/marketplace-templates/** (master_admin builds versioned
-- dashboard templates; the tools-5 dashboard reads the live one). Hub-owned,
-- same split as listing_templates / profit_loss_history.
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- 1. marketplace_templates — one row per template (a template = one marketplace)
CREATE TABLE IF NOT EXISTS marketplace_templates (
  id                 VARCHAR(255) PRIMARY KEY,                 -- nanoid, from lib/db.js
  owner_id           UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_name         VARCHAR(255),
  owner_role         VARCHAR(50),
  template_number    VARCHAR(20)  NOT NULL,                    -- "MPT-0001", per owner
  marketplace_name   VARCHAR(255) NOT NULL DEFAULT 'Untitled',
  description        TEXT          NOT NULL DEFAULT '',
  is_live            BOOLEAN      NOT NULL DEFAULT FALSE,
  live_version_id    UUID,                                     -- -> marketplace_template_details.id
  show_in_sidebar    BOOLEAN      NOT NULL DEFAULT TRUE,       -- denormalized from config.visibility.marketplaceInSidebar
  last_published_at  TIMESTAMPTZ,                              -- "Live date"
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),      -- "Last update"
  UNIQUE (owner_id, template_number)
);
CREATE INDEX IF NOT EXISTS idx_mp_templates_owner ON marketplace_templates(owner_id);
CREATE INDEX IF NOT EXISTS idx_mp_templates_live  ON marketplace_templates(is_live) WHERE is_live = TRUE;
ALTER TABLE marketplace_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role manages marketplace_templates" ON marketplace_templates;
CREATE POLICY "Service role manages marketplace_templates"
  ON marketplace_templates FOR ALL USING (auth.role() = 'service_role');

-- 2. marketplace_template_details — one row per VERSION of a template.
--    Holds the entire builder payload (§3) in `config`.
CREATE TABLE IF NOT EXISTS marketplace_template_details (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id          VARCHAR(255) NOT NULL REFERENCES marketplace_templates(id) ON DELETE CASCADE,
  version_number       INTEGER      NOT NULL DEFAULT 1,        -- "Version Number"
  sub_version_number   INTEGER      NOT NULL DEFAULT 1,        -- "Sub Version Number"
  status               VARCHAR(16)  NOT NULL DEFAULT 'draft',  -- draft | live | archived
  config               JSONB        NOT NULL DEFAULT '{}',     -- the whole §3 schema
  note                 VARCHAR(500) NOT NULL DEFAULT '',
  created_by           UUID         REFERENCES users(id) ON DELETE SET NULL,
  created_by_name      VARCHAR(255),
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),    -- "Create date"
  published_at         TIMESTAMPTZ,                            -- "Live date" (per version)
  UNIQUE (template_id, version_number, sub_version_number)
);
CREATE INDEX IF NOT EXISTS idx_mp_details_template ON marketplace_template_details(template_id);
CREATE INDEX IF NOT EXISTS idx_mp_details_live     ON marketplace_template_details(template_id, status);
ALTER TABLE marketplace_template_details ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role manages marketplace_template_details" ON marketplace_template_details;
CREATE POLICY "Service role manages marketplace_template_details"
  ON marketplace_template_details FOR ALL USING (auth.role() = 'service_role');

-- 3. marketplace_template_logs — append-only audit of create/update/delete +
--    every version change + every show/hide toggle.
CREATE TABLE IF NOT EXISTS marketplace_template_logs (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  VARCHAR(255) NOT NULL REFERENCES marketplace_templates(id) ON DELETE CASCADE,
  version_id   UUID         REFERENCES marketplace_template_details(id) ON DELETE SET NULL,
  actor_id     UUID         REFERENCES users(id) ON DELETE SET NULL,
  actor_name   VARCHAR(255),
  action       VARCHAR(40)  NOT NULL,   -- template.create | template.update | template.delete
                                        -- version.create | version.update | version.publish
                                        -- version.unpublish | version.rollback
                                        -- sidebar.toggle | tab.toggle
  detail       JSONB        NOT NULL DEFAULT '{}',   -- { before, after, summary }
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mp_logs_template ON marketplace_template_logs(template_id, created_at DESC);
ALTER TABLE marketplace_template_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role manages marketplace_template_logs" ON marketplace_template_logs;
CREATE POLICY "Service role manages marketplace_template_logs"
  ON marketplace_template_logs FOR ALL USING (auth.role() = 'service_role');

-- 4. marketplace_template_counters — per-owner "MPT-000N" sequence
CREATE TABLE IF NOT EXISTS marketplace_template_counters (
  owner_id   UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  counter    INTEGER     NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE marketplace_template_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role manages marketplace_template_counters" ON marketplace_template_counters;
CREATE POLICY "Service role manages marketplace_template_counters"
  ON marketplace_template_counters FOR ALL USING (auth.role() = 'service_role');

-- 5. Per-user grant for the Template Settings section (locked decision ③).
--    Same rationale/shape as scripts/listing_template_access_migration.sql:
--    a brand-new gate nothing relied on before, so NOT NULL DEFAULT FALSE
--    ("off until master_admin explicitly grants") is not a regression, and
--    adding a constant-default column is a metadata-only change on PG 11+.
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS marketplace_template_access BOOLEAN NOT NULL DEFAULT FALSE;
```

**Modified table:** `user_settings` gains one boolean column (above).
`users.id` is already `UUID`; nothing else changes.
**Run step:** paste into the Supabase SQL editor after merge; record in
`MEMORY.md` as "not yet run" until confirmed.

---

## 7. API routes

### 7.1 Hub — `admin-pannels/app/api/marketplace-templates/**` (NEW)

All `runtime='nodejs'`; guard `getAuthPayload(req)` → `401`. **Write routes**
require `canBuild = payload.role === 'master_admin' || getUserMarketplaceTemplateAccess(payload.userId)`
→ `403`; **`[id]` write routes** additionally require
`payload.role === 'master_admin' || row.owner_id === payload.userId` → `403`.
**Read routes** scope to `owner_id` unless `master_admin` (`?scope=all`).

```
GET    /api/marketplace-templates              list (master_admin ?scope=all: all; else own)  ?includeVersions=1
POST   /api/marketplace-templates              create template (+ first draft v1.1)          [canBuild]
GET    /api/marketplace-templates/live         PUBLIC — no auth. Returns every template
                                               where is_live AND show_in_sidebar, each with its
                                               live config. Cache-Control: no-store.
GET    /api/marketplace-templates/[id]         template + versions[] + live config            [owner | master_admin]
PATCH  /api/marketplace-templates/[id]         rename / description / show_in_sidebar / visibility  [owner | master_admin]
DELETE /api/marketplace-templates/[id]         delete template (cascade details + logs)             [owner | master_admin]

GET    /api/marketplace-templates/[id]/versions            versions list                            [owner | master_admin]
POST   /api/marketplace-templates/[id]/versions            save draft (body: { config, note, major? }) [owner | master_admin]
GET    /api/marketplace-templates/[id]/versions/[vid]      one version's full config                [owner | master_admin]
PUT    /api/marketplace-templates/[id]/versions/[vid]      overwrite a DRAFT version's config       [owner | master_admin]
POST   /api/marketplace-templates/[id]/versions/[vid]/publish     make live / unpublish (body { live:bool }) [owner | master_admin]

GET    /api/marketplace-templates/[id]/logs               ?limit=&cursor= — change log             [owner | master_admin]
POST   /api/marketplace-templates/[id]/source-file        OPTIONAL — Blob-store a sample sheet      [owner | master_admin]

── grant screen (master_admin only) ──
GET    /api/marketplace-template-access                    list users + their allowed flag          [master_admin]
PUT    /api/marketplace-template-access                    { userId, allowed } → upsert user_settings [master_admin]
GET    /api/marketplace-template-access/me                 { allowed } for the caller               [any auth]
```

Per‑route logic highlights:
- **POST `/versions`** — validate `config` with a server copy of
  `validateConfig()` (reject unknown `chartType`, pie series < 2, formula
  referencing a missing header name, cyclic formula graph). Compute
  `version_number` / `sub_version_number`. Insert `status='draft'`. `updated_at`
  bump on the parent. Write `version.create` log.
- **POST `/publish`** — single Supabase call sequence (no cross‑table txn
  available via the JS client, so: set target `status='live', published_at=now()`
  → set prior live `status='archived'` → `update marketplace_templates` set
  `is_live, live_version_id, last_published_at` → insert `version.publish` log).
  Order chosen so a partial failure leaves the old live still live.
- **GET `/live`** — the only anonymous route. Returns
  `[{ id, marketplaceName, templateNumber, config }]`. Never leaks drafts.
- **DELETE** — `marketplace_template_logs` + `_details` cascade via FK; write a
  final `template.delete` log **before** the delete (to a
  `marketplace_template_logs` archive? no — logs cascade too; instead also
  append to a lightweight `tool_usage_events`‑style trail? **v1: accept that
  deleting a template deletes its logs** — Q7).

### 7.2 Tool app — `tools-5/app/api/marketplace-templates/**` (NEW, thin proxies)

Same forward‑the‑caller's‑token idiom as `app/api/profit-loss/settings/route.js`:

```
GET  /api/marketplace-templates/live         → proxyAdminCall('/api/marketplace-templates/live')  [no auth — matches proxy.js "non-admin API passes through"]
*    /api/marketplace-templates/**            → getAuthPayload → 401 → proxyAdminCall(path, { authHeader: authHeaderFrom(req) })
*    /api/marketplace-template-access[/me]    → getAuthPayload → 401 → proxyAdminCall(path, { authHeader: authHeaderFrom(req) })
```

`proxy.js` matcher already covers `/api/:path*`; `/api/marketplace-templates/*`
and `/api/marketplace-template-access/*` are **not** under `/api/admin` or
`/api/profit-loss`, so the middleware lets them through and each route's own
`getAuthPayload` (or lack of it, for `/live`) is the gate. No middleware change
needed. No new env.

### 7.3 hub `lib/db.js` functions (NEW, near the `*ListingTemplate*` block — the only place snake_case appears)

```
nextMarketplaceTemplateNumber(ownerId)              -> "MPT-000N"  (read-then-write, like listing_template_counters)
listMarketplaceTemplates({ ownerId, scopeAll })     -> rows.map(toMarketplaceTemplateRow)
getMarketplaceTemplate(id)                          -> row | null
getMarketplaceTemplateWithVersions(id)             -> { template, versions[], liveConfig }
createMarketplaceTemplate({ ownerId, ownerName, ownerRole, marketplaceName, description, config })
                                                    -> inserts template + first details row (v1.1 draft) + template.create log
updateMarketplaceTemplate(id, patch, actor)         -> whitelist { marketplaceName, description, showInSidebar } + touch updated_at + template.update log
deleteMarketplaceTemplate(id, actor)                -> template.delete log, then delete (cascade)
listMarketplaceTemplateVersions(templateId)
getMarketplaceTemplateVersion(templateId, vid)
createMarketplaceTemplateVersion(templateId, { config, note, major, createdBy, createdByName })
updateMarketplaceTemplateVersion(templateId, vid, { config, note })   -- guarded: status must be 'draft'
publishMarketplaceTemplateVersion(templateId, vid, { live }, actor)   -- the sequence in §7.1
getLiveMarketplaceConfigs()                          -> [{ id, marketplaceName, templateNumber, config }]
listMarketplaceTemplateLogs(templateId, { limit, cursor })
recordMarketplaceTemplateLog({ templateId, versionId, actorId, actorName, action, detail })
toMarketplaceTemplateRow(r) / toVersionRow(r) / toLogRow(r)   -- camelCase mappers
-- grant flag (ported from getUserListingTemplateAccess / upsertUserListingTemplateAccess)
getUserMarketplaceTemplateAccess(userId)             -> from('user_settings').select('marketplace_template_access')...  -> bool
upsertUserMarketplaceTemplateAccess(userId, allowed) -> upsert user_settings
listUsersWithMarketplaceTemplateAccess()            -> [{ userId, name, email, role, allowed }]  (grant screen)
```

No route handler carries business logic beyond validation + auth; no LLM
anywhere.

---

## 8. Formula engine — `lib/profitLoss/formula.js` (ported) + `resolveTemplate.js` (new)

- **`formula.js`** — a near‑verbatim port of tools‑4
  `components/listing/formula.js`: `tokenize` / `parse` (recursive‑descent
  `+ - * / ^`, parens, `power` alias), `evaluateFormula(formula, scope,
  refNames)`. Two changes: (1) `scope` is a flat `{ [name]: number|string }`
  map instead of a row+headers pair; (2) references resolve against a passed
  `refNames[]` (all header/card names in scope) — same longest‑match‑first
  bracket/bare logic. Text‑join mode kept (for `alphanumeric` headers like a
  composite label).
- **Row context** (table Header cells): `scope` = that groupBy row's base
  metrics + every already‑evaluated formula header (topological order;
  `resolveTemplate` builds the dependency graph from `[Name]` tokens, detects
  cycles → the offending header shows `#CYCLE`).
- **Aggregate context** (Title Card `mainValue`/`subValue`, Graph Data series,
  Overview cells): `scope` = column **totals** across the filtered dataset
  (`Σ` of each header over all rows) + scalar built‑ins (`[Ads %]`, `[SKU
  Count]`, `[Row Count]`).
- **Time bucket** (non‑pie graphs, the `"times"` axis): `resolveTemplate`
  groups the filtered canonical rows by `orderDate` truncated to the series'
  `unit` and evaluates the measure formula per bucket → `[{ t, value }]`.
- **`validateConfig(config)`** — shared by the builder (`useTemplateDraft`) and
  the hub POST route: every `[Name]` in every formula resolves; pie graphData
  has ≥ 2 series; non‑pie has exactly 1; `graphDesignId` exists; `chartType` ∈
  enum; tab ids reference real cards/graphs/headers; no formula cycle.

---

## 9. Output file structure

### 9.1 `tools/arshanemi-tools-5/` (NEW ✚ / MODIFIED ✎)

```
data/
  templateSchema.js            ✚ 120  shape + makeEmptyConfig + validateConfig + CONFIG_VERSION
  defaultTemplate.js           ✚ 180  the image-1 fallback config (8 tabs, 7 cards, 14 headers, 2 graphs)
  defaultHeaders.js            ✚ 110  P&L primitive/default headers (name, type, primitive|formula, format)
  nav.js                       ✚ 30   the top-nav items for DashboardTopbar (image-1 multi-tool bar)
lib/profitLoss/
  formula.js                   ✚ 210  ported recursive-descent evaluator (no eval)
  resolveTemplate.js           ✚ 240  config + base metrics -> { tableRows, titleCardValues, graphSeries, overviewRows }
  engine.js                    ✎ +40  expose raw base-metric buckets (not just the fixed skuRows shape)
  exportDashboard.js           ✎ +90  template-driven Excel/PDF (cards block + table + per-graph sheet)
  templatesApi.js              ✚ 60   client fetch helpers (list/get/saveDraft/publish/logs/live)
components/dashboard/
  DashboardWorkspace.jsx       ✚ 240  sidebar + main; owns config/tab/uploads/filters/dataset state
  DashboardSidebar.jsx         ✚ 150  search + Reset + gear + tab list + Overview + Template Settings
  DashboardTopbar.jsx          ✎ +40  data-driven multi-tool nav from data/nav.js
  DashboardToolbar.jsx         ✎ ~    upload buttons generated from config.fileSlots
  DashboardHeaderBar.jsx       ✎ ~    Setting button + <CompanyFilter/>
  BrandFilter.jsx              ✚ 70   toolbar "Select Brand ▾"  (config.marketplace.brandHeaderId)
  CompanyFilter.jsx            ✚ 70   header-bar "All Companies ▾" (config.marketplace.companyHeaderId) — independent
  MarketplacePicker.jsx        ✎ ~    lists live templates + built-in default
  TabView.jsx                  ✚ 150  renders one config.tab (cards + graphs + pills + table)
  OverviewTab.jsx              ✚ 130  Header Wise Overview table + export
  GraphStrip.jsx               ✚ 90
  TemplateChart.jsx            ✚ 200  inline-SVG line/bar/area/pie, theme tokens, overflow-x-auto
  KpiCardRow.jsx / KpiCard.jsx ✎ ~    title-card driven
  DetailsTable.jsx / ColumnHeaderCell.jsx / DetailsViewPills.jsx  ✎ ~  columns from active tab headers
components/templateSettings/            ✚ (all new — the builder)
  TemplateSettingsList.jsx     ✚ 190  list page: rows, last update, live date, id, show/hide, logs
  TemplateLogPanel.jsx         ✚ 90   change-log drawer/dock
  TemplateBuilder.jsx          ✚ 240  the scrolling page: sticky pill-nav + all sections + Save/Publish footer
  useTemplateDraft.js          ✚ 160  draft state, dirty, validate, localStorage recovery, save/publish
  FormulaEditor.jsx            ✚ 150  + - / ( ) % Text row, Header List, Copy/Post, preview, helper line
  TypeToggle.jsx               ✚ 40
  ListEditorColumn.jsx         ✚ 90
  HeaderPickerStrip.jsx        ✚ 90
  HeaderSection.jsx            ✚ 220  types, formula, default/extracted/added groups, union rule
  TitleCardSection.jsx         ✚ 170  name + main value + sub value (two independent FormulaEditors)
  GraphDesignSection.jsx       ✚ 110  name + Line/Bar/Area/Pie chooser
  GraphDataSection.jsx         ✚ 230  type, graph design, series editor (pie >=2 / others 1 + "times")
  TabSection.jsx               ✚ 260  compose cards/graphs/headers, reorder, positioning, per-tab show/hide
  OverviewTabSection.jsx       ✚ 120
  MarketPlaceSection.jsx       ✚ 260  file slots, sample upload, Unmap/Our/Map mapping grid
  VersionSection.jsx           ✚ 150  version table + on/off publish toggle
  TemplateAccessPanel.jsx      ✚ 150  grant screen — user list + per-user allow toggle (ported from tools-4)
lib/
  marketplaceTemplateAccess.js ✚ 25   fetchTemplateSettingsAllowed(token, role)  (ported from tools-4)
app/profit-loss/
  page.js                      ✎ ~    (unchanged shell; body swap happens in ProfitLossShell)
  template-settings/
    layout.js                  ✚ 34   gate: master_admin OR fetchTemplateSettingsAllowed → else redirect
    page.js                    ✚ 20   -> <TemplateSettingsList/>
    new/page.js                ✚ 12   -> <TemplateBuilder/>
    [id]/page.js               ✚ 14   -> <TemplateBuilder templateId={id}/>
  template-access/
    page.js                    ✚ 24   master_admin-only inline gate -> <TemplateAccessPanel/>
app/api/marketplace-templates/
  live/route.js                ✚ 25   proxy, no auth
  route.js                     ✚ 40   GET/POST proxy (+ getAuthPayload)
  [id]/route.js                ✚ 45   GET/PATCH/DELETE proxy
  [id]/versions/route.js       ✚ 35
  [id]/versions/[vid]/route.js ✚ 35
  [id]/versions/[vid]/publish/route.js  ✚ 25
  [id]/logs/route.js           ✚ 25
app/api/marketplace-template-access/
  route.js                     ✚ 30   GET list / PUT { userId, allowed }  proxy (+ getAuthPayload)
  me/route.js                  ✚ 20   GET { allowed }  proxy (+ getAuthPayload)
components/dashboard/ProfitLossShell.jsx  ✎ +20  render <DashboardWorkspace/> instead of bare <ProfitLossView/>; keep <ProfitLossView/> reachable as the fallback renderer body
```

`ProfitLossView.jsx` (Rev 2) is **kept** — `DashboardWorkspace` reuses its
ingest/parse/settings logic; the fixed layout it renders today becomes the
`defaultTemplate.js` path.

### 9.2 `admin-pannels/` — backend delta

```
scripts/marketplace_templates_migration.sql   ✚  3 tables + counter + RLS + user_settings.marketplace_template_access (§6)
app/api/marketplace-templates/
  route.js                                     ✚ 70   GET list / POST create
  live/route.js                                ✚ 35   PUBLIC live configs
  [id]/route.js                                ✚ 80   GET / PATCH / DELETE
  [id]/versions/route.js                       ✚ 70   GET / POST(save draft, validateConfig)
  [id]/versions/[vid]/route.js                 ✚ 60   GET / PUT(draft only)
  [id]/versions/[vid]/publish/route.js         ✚ 55   POST publish/unpublish sequence
  [id]/logs/route.js                           ✚ 40   GET paginated
app/api/marketplace-template-access/
  route.js                                     ✚ 45   GET user list / PUT { userId, allowed }   [master_admin]
  me/route.js                                  ✚ 25   GET { allowed }                           [any auth]
lib/db.js                                      ✎ +260  ~18 marketplace_template_* / access fns + 3 camelCase mappers
lib/templateConfig.js                          ✚ 90   server copy of validateConfig (imported by the version routes)
```

**Estimated new/changed LOC:** ~4,900 in tools‑5 (~2,900 of it the builder),
~1,000 in admin‑pannels. No file over 400 LOC.

---

## 10. Build sequence (milestones)

1. **Schema + hub API.** `marketplace_templates_migration.sql` (incl. the
   `user_settings.marketplace_template_access` column) → `lib/db.js` fns +
   `lib/templateConfig.js` → the 8 hub routes + the 2
   `marketplace-template-access` routes. Test with `curl` against a
   hand‑written `config`.
2. **Tool proxies + client helpers.** `app/api/marketplace-templates/**`,
   `app/api/marketplace-template-access/**`, `lib/marketplaceTemplateAccess.js`,
   `lib/profitLoss/templatesApi.js`.
3. **Schema module + fallback.** `data/templateSchema.js`,
   `data/defaultHeaders.js`, `data/defaultTemplate.js` (must reproduce image 1
   exactly with zero backend).
4. **Formula + resolver.** Port `formula.js`; write `resolveTemplate.js`; unit
   tests against `source/samples/*.csv` + `defaultTemplate.js`.
5. **Task 1 render.** `DashboardWorkspace` + `DashboardSidebar` + `TabView` +
   template‑driven `KpiCardRow`/`DetailsTable`/`DetailsViewPills` +
   `GraphStrip`/`TemplateChart` + `DashboardTopbar` nav + `BrandFilter`.
   Pixel‑diff against image 1 with the fallback config, then with a live
   template.
6. **Task 2 access + read paths.** `template-settings/layout.js` gate
   (`master_admin || fetchTemplateSettingsAllowed`) + `/profit-loss/template-access`
   grant screen (`TemplateAccessPanel`) + sidebar entry wiring + list page +
   `TemplateBuilder` shell + `useTemplateDraft` + `VersionSection` +
   `TemplateLogPanel`.
7. **Task 2 builder — section editors.** `MarketPlaceSection` (upload + mapping
   grid) → `HeaderSection` (+ union rule) → `TitleCardSection` →
   `GraphDesignSection` → `GraphDataSection` → `TabSection` →
   `OverviewTabSection`. Shared `FormulaEditor`/`TypeToggle`/`ListEditorColumn`/
   `HeaderPickerStrip` first.
8. **Save / publish / logs** end‑to‑end; publish a template and confirm it
   appears in the dashboard's `Market Place` picker and drives the sidebar.
9. **Export** — template‑driven Excel/PDF for a tab + the Overview tab.
10. **Docs** — update `CLAUDE.md` (navbar rule, new `/template-settings`
    section, the 3 tables), add the migration + `MEMORY.md` "not yet run" note.

---

## 11. Open questions

**Resolved 2026‑09‑10** — ① navbar matches image 1 (data‑driven, single‑product
rule retired); ② one template = one marketplace (v1); ③ Template Settings is
`master_admin` + individually grantable (`user_settings.marketplace_template_access`
+ `/profit-loss/template-access` grant screen); ④ Company and Brand are two
independent AND‑applied filters.

Still open:

1. **Q1 — Sample sheet storage.** The builder needs extracted headers + a few
   sample values, which are snapshotted into `config`. Storing the **raw**
   uploaded sample in Vercel Blob is optional. Skip raw‑file retention for v1?
2. **Q2 — Live read exposure.** `GET /api/marketplace-templates/live` is public
   (anonymous dashboards need it). OK to expose live template `config` (no row
   data — just structure / formulas / header names) unauthenticated?
3. **Q3 — Deleting a template deletes its logs** (FK cascade). Acceptable, or
   should `marketplace_template_logs` survive deletion (separate archival
   table / `ON DELETE SET NULL` on `template_id`)?
4. **Q4 — Charts.** Plan hand‑draws SVG charts (no dep) to stay within the CDN
   allowlist and keep the bundle small. Acceptable, or add a charting lib?
5. **Q5 — "Header 1 / 2 / 3" buttons.** Image 1's toolbar shows three generic
   `Header N` upload buttons (image 2's "Add File" produces them). Plan makes
   these fully template‑defined `fileSlots` with `kind:'aux'`. Any fixed
   meaning intended (e.g. Ads report, Returns report)?
6. **Q6 — Version numbering.** Plan: `Save` bumps `sub_version`, "Save as new
   major" bumps `version` and resets `sub` to 1; publishing any row sets it
   live and archives the previous live. Matches the "Version / Sub Version"
   columns — confirm the bump rules.
7. **Q7 — Deploy URL.** `SITE_URL` in `app/layout.js` currently
   `https://profit-loss.barmeto.com` — confirm, and confirm `ALLOWED_ORIGINS`
   for the hub SSO iframe.

---

## 12. Key decisions

- **D1 — Template = versioned JSON `config`.** The dashboard is a pure renderer;
  the Rev‑2 engine only supplies base metrics. A new marketplace layout is a
  new template row, zero code.
- **D2 — Hub‑owned, 3 tables.** `marketplace_templates` (pointer + live/date
  denorm), `marketplace_template_details` (version‑wise `config`),
  `marketplace_template_logs` (audit) + a per‑owner counter — mirrors
  `listing_templates_migration.sql`. Tool app stays DB‑free; thin proxies only.
- **D3 — Template Settings = `master_admin` OR individually granted**
  (`user_settings.marketplace_template_access`, ported 1:1 from tools‑4's
  `listing_template_access`) — double gate (`template-settings/layout.js` server
  redirect + hidden sidebar entry) + a `master_admin`‑only grant screen at
  `/profit-loss/template-access`. Templates are `owner_id`‑scoped: `master_admin`
  edits all, a granted user edits only their own; `/live` is global.
- **D4 — Reuse, don't reinvent.** Formula evaluator ported from tools‑4
  `formula.js`; sidebar drawer / shell / gate patterns from
  `ListingToolsShell` + `template-settings/layout.js`; proxy idiom from
  `/api/profit-loss/settings`; counter pattern from `listing_template_counters`.
- **D5 — Always‑working fallback.** `data/defaultTemplate.js` reproduces image 1
  with no backend; a live template overrides it per marketplace.
- **D6 — Union header rule.** Final headers =
  `default ∪ manual ∪ unmapped‑extracted`; mapping a sheet header to a default
  removes it from the pool. This is the user's explicit requirement and the
  spine of `HeaderSection` ↔ `MarketPlaceSection`.
- **D7 — Pie vs non‑pie graph data.** Pie → ≥ 2 formula‑driven title/value
  pairs; every other chart → 1 measure + a fixed `"times"` (time‑bucket)
  second axis. Enforced in `validateConfig` on both sides.
- **D8 — No new deps.** Charts are inline SVG; parsing/export stay on the
  existing `xlsx` / `exceljs` / `jspdf`.
- **D9 — Navbar matches image 1** (data‑driven multi‑tool bar, `data/nav.js`);
  the CLAUDE.md "single‑product navbar" rule is retired (milestone 10).
- **D10 — Company and Brand are separate filters.** `config.marketplace` carries
  both `companyHeaderId` and `brandHeaderId`; `resolveTemplate` applies date ∧
  company ∧ brand ∧ platform independently, all AND, before aggregation.
- **D11 — One template = one marketplace** for v1; multi‑marketplace templates
  are a later revision.

---

## 13. Next step

Plan stops at "written + reviewed". On approval, execute §10 in order. Nothing
is implemented yet — this revision only rewrites the plan.
