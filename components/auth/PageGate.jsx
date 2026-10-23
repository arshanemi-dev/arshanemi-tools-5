'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Lock, LogIn } from 'lucide-react';
import { authFetch, getStoredUser, isLoggedIn } from '@/lib/tokenStore';
import { redirectToLogin } from '@/lib/authGate';
import { getMyTemplateAccess } from '@/lib/profitLoss/templatesApi';

// Who may see a page — its `children` only render once that's known:
//  - 'signedIn' — anyone signed in (Position Settings);
//  - 'templates' — signed in and allowed to build templates: master_admin,
//    or a user master_admin granted (the hub's marketplace_template_access)
//    — Template Settings, the Sheet Debugger;
//  - 'master' — master_admin only (Template Access, the grant screen).
// Signed out → a sign-in card; signed in without access → a no-access card;
// until it knows → a spinner. The login lives in this browser's storage
// (the hub's SSO handoff puts it there before any page code runs —
// lib/tokenHandoff.js), which the server can't see — so the server and the
// first render both draw the spinner, and the page itself never shows to
// someone who may not use it, not even for a moment. The pages' own server
// checks still turn away a known non-privileged session before this.
// Signed in = a refresh token is stored (isLoggedIn, like the rest of the
// app) — the cached user may be missing (a handoff without one), so its
// role is only a shortcut; without it the hub is asked.
const MASTER = 'master_admin';

const subscribe = (onChange) => {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
};
// undefined until the browser knows (the server, the hydration render), then true / false.
const useSignedIn = () => useSyncExternalStore(subscribe, isLoggedIn, () => undefined);

function Panel({ icon: Icon, title, text, children }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-sm rounded-2xl border border-divider bg-background p-8 text-center">
        <Icon className="mx-auto text-accent" size={28} />
        <h1 className="mt-3 text-lg font-bold text-foreground">{title}</h1>
        <p className="mt-1 text-sm text-muted">{text}</p>
        <div className="mt-5 flex justify-center">{children}</div>
      </div>
    </div>
  );
}

const Spinner = () => (
  <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="animate-spin text-muted" size={28} /></div>
);

// May a signed-in user with `role` ('' = not cached) open an `access` page?
// Resolves true / false — never throws.
function askAccess(access, role) {
  if (role === MASTER) return Promise.resolve(true);
  if (access === 'master') {
    if (role) return Promise.resolve(false);
    return authFetch('/api/auth/me').then((r) => (r.ok ? r.json() : null)).then((p) => p?.role === MASTER);
  }
  return getMyTemplateAccess().then(({ ok, data }) => ok && !!data?.allowed);
}

export default function PageGate({ access = 'signedIn', what = 'this page', children }) {
  const signedIn = useSignedIn();
  const role = signedIn ? getStoredUser()?.role || '' : '';
  const needsCheck = access !== 'signedIn' && signedIn === true;
  const [answer, setAnswer] = useState(null); // { key, allowed } — the access check's, for this role

  useEffect(() => {
    if (!needsCheck) return undefined;
    let cancelled = false;
    askAccess(access, role)
      .catch(() => false)
      .then((allowed) => { if (!cancelled) setAnswer({ key: role, allowed: !!allowed }); });
    return () => { cancelled = true; };
  }, [needsCheck, access, role]);

  if (signedIn === undefined) return <Spinner />;
  if (!signedIn) {
    return (
      <Panel icon={LogIn} title={`Sign in to open ${what}`} text="This page is for signed-in users only.">
        <button type="button" onClick={redirectToLogin} className="inline-flex items-center gap-1.5 rounded-full bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-action-hover">
          <LogIn size={15} /> Sign in
        </button>
      </Panel>
    );
  }
  if (!needsCheck) return children;
  if (!answer || answer.key !== role) return <Spinner />;
  if (!answer.allowed) {
    return (
      <Panel icon={Lock} title={`No access to ${what}`} text={access === 'master' ? 'Only the master admin can open this page.' : 'Ask the master admin for access to Template Settings.'}>
        <Link href="/profit-loss" className="inline-flex items-center gap-1.5 rounded-full border border-divider-light px-4 py-2 text-sm font-semibold text-foreground hover:bg-card-hover">
          <ArrowLeft size={15} /> Back to dashboard
        </Link>
      </Panel>
    );
  }
  return children;
}
