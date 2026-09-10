'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Menu } from 'lucide-react';
import UserMenu from './UserMenu';
import { redirectToLogin } from '@/lib/authGate';
import { NAV_ITEMS, ACTIVE_NAV_KEY } from '@/data/nav';

// The reference dashboard's dark navbar: logo, the multi-tool link row
// (data/nav.js — "Profit & loss" is the active item), and login / account.
export default function DashboardTopbar({ user, onLogout, onMenuClick }) {
  return (
    <header className="sticky top-0 z-50 flex-shrink-0 border-b border-white/10 bg-footer">
      <div className="w-full px-4 sm:px-6 lg:px-10">
        <div className="flex items-center gap-3 py-3 sm:gap-6">
          {onMenuClick && (
            <button
              type="button"
              onClick={onMenuClick}
              aria-label="Open menu"
              className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
            >
              <Menu size={20} />
            </button>
          )}

          <Link href="/" className="flex shrink-0 items-center">
            <Image src="/images/barmeto-logo.png" alt="Barmeto" width={132} height={40} className="h-9 w-auto rounded-lg" priority />
          </Link>

          <nav className="flex min-w-0 flex-1 items-center gap-5 overflow-x-auto [&::-webkit-scrollbar]:hidden">
            {NAV_ITEMS.map((item) => {
              const active = item.key === ACTIVE_NAV_KEY;
              const cls = `whitespace-nowrap text-sm transition-colors ${
                active ? 'font-semibold text-white underline underline-offset-8 decoration-2' : 'text-white/70 hover:text-white'
              }`;
              return item.internal ? (
                <Link key={item.key} href={item.href} className={cls}>{item.label}</Link>
              ) : (
                <a key={item.key} href={item.href} className={cls}>{item.label}</a>
              );
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-3">
            {user ? (
              <UserMenu user={user} onLogout={onLogout} />
            ) : (
              <button
                type="button"
                onClick={redirectToLogin}
                className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-white px-5 py-2 text-sm font-semibold text-accent transition-colors hover:bg-white/90"
              >
                Log in
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
