import { Suspense } from 'react';
import { ToastProvider } from '@/components/admin/Toast';
import TemplateSettingsChrome from '@/components/templateSettings/TemplateSettingsChrome';
import PositionSettingsPage from '@/components/positionSettings/PositionSettingsPage';

export const metadata = { title: 'Position Settings — Profit & Loss', robots: { index: false } };

// A signed-in user's own dashboard arrangement — the dashboard's Position
// button opens it. Everything lives in <PositionSettingsPage/> (client);
// signed out it asks you to sign in. Suspense: it reads ?m= (the
// marketplace the dashboard had open).
export default function PositionSettingsRoute() {
  return (
    <ToastProvider>
      <TemplateSettingsChrome page="position-settings">
        <Suspense fallback={null}>
          <PositionSettingsPage />
        </Suspense>
      </TemplateSettingsChrome>
    </ToastProvider>
  );
}
