'use client';

import { useEffect, useState } from 'react';
import { getStoredUser, clearAuthTokens, isLoggedIn } from '@/lib/tokenStore';
import DashboardTopbar from './DashboardTopbar';
import ProfitLossView from './ProfitLossView';

// Client shell: owns the topbar's user/session, renders the dashboard.
// The page itself is fully usable signed-out (see lib/authGate.js) — the
// topbar just shows "Log in" then.
export default function ProfitLossShell() {
  const [user, setUser] = useState(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) return;
    setUser(getStoredUser());
    // Refresh with the live profile (name/role can change server-side).
    fetch('/api/auth/me', { headers: authHeader() })
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => p && setUser((u) => ({ ...u, ...p })))
      .catch(() => {});
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      clearAuthTokens();
      window.location.href = '/profit-loss';
    }
  }

  return (
    <div className="min-h-screen bg-surface">
      <DashboardTopbar user={user} onLogout={handleLogout} loggingOut={loggingOut} />
      <ProfitLossView />
    </div>
  );
}

function authHeader() {
  if (typeof window === 'undefined') return {};
  const t = localStorage.getItem('access_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}
