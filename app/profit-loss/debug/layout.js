import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { fetchTemplateSettingsAllowed } from '@/lib/marketplaceTemplateAccess';
import { ToastProvider } from '@/components/admin/Toast';
import TemplateSettingsChrome from '@/components/templateSettings/TemplateSettingsChrome';

export const metadata = { title: 'Sheet Debugger — Profit & Loss', robots: { index: false } };

// Same gate as /profit-loss/template-settings — this is a diagnostic tool
// for whoever builds marketplace templates, not a public page. See that
// layout.js for why a missing payload isn't itself a redirect.
export default async function DebugLayout({ children }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('barmeto-token')?.value || cookieStore.get('admin-token')?.value;
  const payload = token ? await verifyToken(token) : null;

  if (payload && payload.role !== 'master_admin') {
    const allowed = await fetchTemplateSettingsAllowed(token, payload.role);
    if (!allowed) redirect('/profit-loss');
  }

  return (
    <ToastProvider>
      <TemplateSettingsChrome page="debug">{children}</TemplateSettingsChrome>
    </ToastProvider>
  );
}
