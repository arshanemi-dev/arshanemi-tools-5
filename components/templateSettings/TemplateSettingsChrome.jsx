'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { clearAuthTokens, isLoggedIn, authFetch } from '@/lib/tokenStore';
import { useStoredUser } from '@/lib/useStoredUser';
import DashboardTopbar from '@/components/dashboard/DashboardTopbar';

const HEADER_HIDDEN = process.env.NEXT_PUBLIC_IS_Header_Hide === 'true';

// Shell for every /profit-loss/template-settings (and /profit-loss/debug)
// page — the shared navbar + a "back to dashboard" bar + a scroll container.
// Mirrors ProfitLossShell's session bootstrap. `page` picks the breadcrumb
// label and which of the two builder-area links to show (never a self-link).
export default function TemplateSettingsChrome({ children, page = 'template-settings' }) {
  const isDebug = page === 'debug';
  // Same hydration-safe user as ProfitLossShell — see useStoredUser.
  const storedUser = useStoredUser();
  const [profile, setProfile] = useState(null);
  const user = storedUser && profile ? { ...storedUser, ...profile } : storedUser;

  useEffect(() => {
    if (!isLoggedIn()) return;
    authFetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => p && setProfile(p))
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
      {!HEADER_HIDDEN && <DashboardTopbar user={user} onLogout={handleLogout} />}
      <div className="flex items-center gap-2 border-b border-divider bg-background px-4 py-2 sm:px-6 lg:px-10">
        <Link href="/profit-loss" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-foreground">
          <ArrowLeft size={15} /> Back to dashboard
        </Link>
        <span className="text-subtle">/</span>
        <span className="text-sm font-semibold text-foreground">{isDebug ? 'Sheet Debugger' : 'Template Settings'}</span>
        <Link
          href={isDebug ? '/profit-loss/template-settings?t=global' : '/profit-loss/debug'}
          className="ml-auto text-sm font-medium text-muted hover:text-foreground"
        >
          {isDebug ? 'Template Settings' : 'Sheet Debugger'}
        </Link>
      </div>
      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
