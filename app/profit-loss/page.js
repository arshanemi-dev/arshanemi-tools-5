import { ToastProvider } from '@/components/admin/Toast';
import ProfitLossShell from '@/components/dashboard/ProfitLossShell';

export const metadata = {
  title: 'Dashboard',
};

// Thin shell. Everything real lives in <ProfitLossShell/> (client) — the page
// works with no account; sign-in only unlocks My Details + History and, for
// master_admin / granted users, the Template Settings entry. The dashboard is
// rendered from the active marketplace template (data/templateSchema shape),
// falling back to data/defaultTemplate.js when none is live.
export default function ProfitLossPage() {
  return (
    <ToastProvider>
      <ProfitLossShell />
    </ToastProvider>
  );
}
