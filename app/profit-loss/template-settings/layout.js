import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { fetchTemplateSettingsAllowed } from '@/lib/marketplaceTemplateAccess';
import { ToastProvider } from '@/components/admin/Toast';
import TemplateSettingsChrome from '@/components/templateSettings/TemplateSettingsChrome';

export const metadata = { title: 'Template Settings — Profit & Loss', robots: { index: false } };

// Covers /new, /[id] and the list page in one place — same pattern as tools-4's
// template-settings/layout.js. A missing payload is deliberately NOT a
// redirect: it can mean "genuinely signed out" or "signed in via the hub SSO
// handoff, cookie not set yet". Only a positively-known non-privileged session
// gets bounced; a real guest's API calls 401 → the shared login modal.
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
      <TemplateSettingsChrome>{children}</TemplateSettingsChrome>
    </ToastProvider>
  );
}
