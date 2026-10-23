import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { fetchTemplateSettingsAllowed } from '@/lib/marketplaceTemplateAccess';
import { ToastProvider } from '@/components/admin/Toast';
import TemplateSettingsChrome from '@/components/templateSettings/TemplateSettingsChrome';
import PageGate from '@/components/auth/PageGate';

export const metadata = { title: 'Template Settings — Profit & Loss', robots: { index: false } };

// Covers /new, /[id] and the list page in one place — same pattern as tools-4's
// template-settings/layout.js. A missing payload is deliberately NOT a
// redirect: it can mean "genuinely signed out" or "signed in via the hub SSO
// handoff, cookie not set yet". Only a positively-known non-privileged session
// gets bounced here; in the browser, PageGate shows the builder only to a
// signed-in user allowed to build templates — a guest gets a sign-in card,
// never the page.
export default async function TemplateSettingsLayout({ children }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('barmeto-token')?.value || cookieStore.get('admin-token')?.value;
  const payload = token ? await verifyToken(token) : null;

  if (payload && payload.role !== 'master_admin') {
    const allowed = await fetchTemplateSettingsAllowed(token, payload.role);
    if (!allowed) redirect('/profit-loss');
  }

  return (
    <ToastProvider>
      <TemplateSettingsChrome>
        <PageGate access="templates" what="Template Settings">{children}</PageGate>
      </TemplateSettingsChrome>
    </ToastProvider>
  );
}
