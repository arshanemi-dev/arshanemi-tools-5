'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getStoredUser, clearAuthTokens, isLoggedIn, authFetch } from '@/lib/tokenStore';
import DashboardTopbar from '@/components/dashboard/DashboardTopbar';

// Shell for every /profit-loss/template-settings page — the shared navbar +
// a "back to dashboard" bar + a scroll container. Mirrors ProfitLossShell's
// session bootstrap.
export default function TemplateSettingsChrome({ children }) {
  const [user, setUser] = useState(() => (isLoggedIn() ? getStoredUser() : null));

  useEffect(() => {
    if (!isLoggedIn()) return;
    authFetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => p && setUser((u) => ({ ...u, ...p })))
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
      <DashboardTopbar user={user} onLogout={handleLogout} />
      <div className="flex items-center gap-2 border-b border-divider bg-background px-4 py-2 sm:px-6 lg:px-10">
        <Link href="/profit-loss" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-foreground">
          <ArrowLeft size={15} /> Back to dashboard
        </Link>
        <span className="text-subtle">/</span>
        <span className="text-sm font-semibold text-foreground">Template Settings</span>
      </div>
      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
