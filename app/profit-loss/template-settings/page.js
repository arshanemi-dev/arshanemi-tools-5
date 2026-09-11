import { Suspense } from 'react';
import TemplateBuilder from '@/components/templateSettings/TemplateBuilder';

// The whole builder lives here now — there is no separate list / new / [id]
// page. The active marketplace is picked in the sidebar and tracked in ?t=.
export default function TemplateSettingsPage() {
  return (
    <Suspense fallback={null}>
      <TemplateBuilder />
    </Suspense>
  );
}
