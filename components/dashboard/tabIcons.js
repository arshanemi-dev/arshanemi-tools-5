import {
  AlertTriangle, BadgePercent, Banknote, BarChart3, Boxes, Calculator, Calendar, ClipboardCheck, Coins,
  CreditCard, FileSpreadsheet, Gift, Globe, IndianRupee, Layers, LayoutDashboard, LineChart, ListOrdered,
  Map as MapIcon, MapPin, Megaphone, Package, PackageCheck, Percent, PieChart, Receipt, RotateCcw, Scale,
  ShieldCheck, ShoppingBag, ShoppingCart, Sigma, Star, Store, Table2, Tags, Target, TrendingDown, TrendingUp,
  Truck, Undo2, Upload, Users, Wallet, Warehouse,
} from 'lucide-react';

// The icons a Tab / Overview Tab can show in the dashboard sidebar — stored
// on the tab by name (`tab.icon`), picked in Template Settings (IconPicker).
// One list shared by the builder and the dashboard so they always agree; an
// unknown / missing name falls back to the default for that kind of tab.
export const TAB_ICONS = [
  { name: 'LayoutDashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { name: 'Layers', label: 'Overview', Icon: Layers },
  { name: 'BarChart3', label: 'Bar chart', Icon: BarChart3 },
  { name: 'LineChart', label: 'Line chart', Icon: LineChart },
  { name: 'PieChart', label: 'Pie chart', Icon: PieChart },
  { name: 'TrendingUp', label: 'Growth', Icon: TrendingUp },
  { name: 'TrendingDown', label: 'Decline', Icon: TrendingDown },
  { name: 'IndianRupee', label: 'Rupee', Icon: IndianRupee },
  { name: 'Coins', label: 'Coins', Icon: Coins },
  { name: 'Wallet', label: 'Wallet', Icon: Wallet },
  { name: 'Banknote', label: 'Cash', Icon: Banknote },
  { name: 'CreditCard', label: 'Payment', Icon: CreditCard },
  { name: 'Receipt', label: 'Receipt', Icon: Receipt },
  { name: 'Calculator', label: 'Profit & loss', Icon: Calculator },
  { name: 'Scale', label: 'Balance', Icon: Scale },
  { name: 'Sigma', label: 'Totals', Icon: Sigma },
  { name: 'Percent', label: 'Percent', Icon: Percent },
  { name: 'BadgePercent', label: 'Discount', Icon: BadgePercent },
  { name: 'ShoppingCart', label: 'Orders', Icon: ShoppingCart },
  { name: 'ShoppingBag', label: 'Sales', Icon: ShoppingBag },
  { name: 'Package', label: 'Product', Icon: Package },
  { name: 'PackageCheck', label: 'Delivered', Icon: PackageCheck },
  { name: 'Boxes', label: 'Inventory', Icon: Boxes },
  { name: 'Warehouse', label: 'Warehouse', Icon: Warehouse },
  { name: 'Truck', label: 'Shipping', Icon: Truck },
  { name: 'Undo2', label: 'Returns', Icon: Undo2 },
  { name: 'RotateCcw', label: 'RTO', Icon: RotateCcw },
  { name: 'AlertTriangle', label: 'Claims', Icon: AlertTriangle },
  { name: 'ShieldCheck', label: 'Settled', Icon: ShieldCheck },
  { name: 'Store', label: 'Marketplace', Icon: Store },
  { name: 'Tags', label: 'SKU / tags', Icon: Tags },
  { name: 'Gift', label: 'Offers', Icon: Gift },
  { name: 'Megaphone', label: 'Ads', Icon: Megaphone },
  { name: 'Target', label: 'Targets', Icon: Target },
  { name: 'Users', label: 'Customers', Icon: Users },
  { name: 'Star', label: 'Ratings', Icon: Star },
  { name: 'Map', label: 'State wise', Icon: MapIcon },
  { name: 'MapPin', label: 'Location', Icon: MapPin },
  { name: 'Globe', label: 'Region', Icon: Globe },
  { name: 'Calendar', label: 'Date wise', Icon: Calendar },
  { name: 'ClipboardCheck', label: 'Outstanding', Icon: ClipboardCheck },
  { name: 'ListOrdered', label: 'List', Icon: ListOrdered },
  { name: 'Table2', label: 'Table', Icon: Table2 },
  { name: 'FileSpreadsheet', label: 'Sheet', Icon: FileSpreadsheet },
  { name: 'Upload', label: 'Upload', Icon: Upload },
];

export const DEFAULT_TAB_ICON = 'LayoutDashboard';
export const DEFAULT_OVERVIEW_ICON = 'Layers';

const BY_NAME = new Map(TAB_ICONS.map((i) => [i.name, i]));

// The lucide component for a stored icon name (`fallback` = that kind of
// tab's default when the name is empty / unknown).
export function tabIconFor(name, fallback = DEFAULT_TAB_ICON) {
  return (BY_NAME.get(name) || BY_NAME.get(fallback) || BY_NAME.get(DEFAULT_TAB_ICON)).Icon;
}

export function tabIconLabel(name, fallback = DEFAULT_TAB_ICON) {
  return (BY_NAME.get(name) || BY_NAME.get(fallback))?.label || 'Icon';
}
