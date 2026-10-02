'use client';

import { useSyncExternalStore } from 'react';
import { Loader2 } from 'lucide-react';

// Brief full-screen loader shown while the app boots — was previously an
// elaborate multi-second cycling-project-names splash; simplified to just a
// spinner that clears as soon as the page is ready to interact with.
//
// "Ready" = hydrated: useSyncExternalStore gives the server snapshot (false)
// for the server render and the hydration pass, then the client snapshot
// (true) — so the spinner is in the server HTML and goes away the moment
// React takes over, without a setState-in-effect.
const subscribe = () => () => {};

export default function SplashScreen() {
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);

  if (hydrated) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-background">
      <Loader2 className="w-6 h-6 text-accent animate-spin" />
    </div>
  );
}
