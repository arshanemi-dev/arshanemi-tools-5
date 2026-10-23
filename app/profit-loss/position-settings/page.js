import { Suspense } from 'react';
import { ToastProvider } from '@/components/admin/Toast';
import TemplateSettingsChrome from '@/components/templateSettings/TemplateSettingsChrome';
import PositionSettingsPage from '@/components/positionSettings/PositionSettingsPage';
import PageGate from '@/components/auth/PageGate';

export const metadata = { title: 'Position Settings — Profit & Loss', robots: { index: false } };

// A signed-in user's own dashboard arrangement — the dashboard's Position
// button opens it. Everything lives in <PositionSettingsPage/> (client),
// shown only to a signed-in user (PageGate) — signed out, a sign-in card and
// nothing of the page, its Save buttons included. Suspense: it reads ?m= (the
// marketplace the dashboard had open).
export default function PositionSettingsRoute() {
  return (
    <ToastProvider>
      <TemplateSettingsChrome page="position-settings">
        <PageGate what="Position Settings">
          <Suspense fallback={null}>
            <PositionSettingsPage />
          </Suspense>
        </PageGate>
      </TemplateSettingsChrome>
    </ToastProvider>
  );
}
