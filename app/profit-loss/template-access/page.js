import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { ToastProvider } from '@/components/admin/Toast';
import TemplateSettingsChrome from '@/components/templateSettings/TemplateSettingsChrome';
import TemplateAccessPanel from '@/components/templateSettings/TemplateAccessPanel';

export const metadata = { title: 'Template Access — Profit & Loss', robots: { index: false } };

// master_admin only — the grant screen for the Template Settings section.
// The nav entry is already hidden from non-master_admin; this adds the check
// server-side so typing the URL can't bypass it.
export default async function TemplateAccessPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('barmeto-token')?.value || cookieStore.get('admin-token')?.value;
  const payload = token ? await verifyToken(token) : null;

  if (payload && payload.role !== 'master_admin') redirect('/profit-loss');

  return (
    <ToastProvider>
      <TemplateSettingsChrome>
        <TemplateAccessPanel />
      </TemplateSettingsChrome>
    </ToastProvider>
  );
}
