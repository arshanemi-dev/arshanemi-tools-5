import { ToastProvider } from '@/components/admin/Toast';
import NextLevelSheetDebugger from '@/components/templateSettings/NextLevelSheetDebugger';

export const metadata = {
  title: 'Next-Level Extraction Debugger',
};

export default function DebugPage() {
  return (
    <ToastProvider>
      <NextLevelSheetDebugger />
    </ToastProvider>
  );
}
