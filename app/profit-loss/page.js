import { ToastProvider } from '@/components/admin/Toast';
import StoreProvider from '@/components/StoreProvider';
import ProfitLossShell from '@/components/dashboard/ProfitLossShell';

export const metadata = {
  title: 'Dashboard',
};

// Thin shell. Everything real lives in <ProfitLossShell/> (client) — the page
// works with no account; sign-in only unlocks My Details + History. The Redux
// store (StoreProvider) holds the per-marketplace sheet-parsing settings,
// mirrored to localStorage.
export default function ProfitLossPage() {
  return (
    <StoreProvider>
      <ToastProvider>
        <ProfitLossShell />
      </ToastProvider>
    </StoreProvider>
  );
}
