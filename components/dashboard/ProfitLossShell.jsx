'use client';

import { useEffect, useState } from 'react';
import { getStoredUser, clearAuthTokens, isLoggedIn, authFetch } from '@/lib/tokenStore';
import { getMyTemplateAccess } from '@/lib/profitLoss/templatesApi';
import DashboardTopbar from './DashboardTopbar';
import DashboardWorkspace from './DashboardWorkspace';

// Client shell: owns the topbar session + the mobile nav drawer state, then
// hands off to <DashboardWorkspace/> (the template-driven dashboard). The page
// works fully signed-out — sign-in only unlocks My Details + History, and
// master_admin / granted users additionally get the Template Settings entry.
export default function ProfitLossShell() {
  const [user, setUser] = useState(() => (isLoggedIn() ? getStoredUser() : null));
  const [canManageTemplates, setCanManageTemplates] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) return;
    authFetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => p && setUser((u) => ({ ...u, ...p })))
      .catch(() => {});
    getMyTemplateAccess()
      .then(({ ok, data }) => { if (ok) setCanManageTemplates(!!data.allowed); })
      .catch(() => {});
  }, []);

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      clearAuthTokens();
      window.location.href = '/profit-loss';
    }
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface">
      <DashboardTopbar user={user} onLogout={handleLogout} onMenuClick={() => setNavOpen(true)} />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <DashboardWorkspace
          canManageTemplates={canManageTemplates}
          mobileNavOpen={navOpen}
          onCloseMobileNav={() => setNavOpen(false)}
        />
      </div>
    </div>
  );
}
