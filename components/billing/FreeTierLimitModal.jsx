'use client'

import { LogIn } from 'lucide-react'
import Modal from '@/components/admin/Modal'
import { redirectToLogin } from '@/lib/authGate'

const count = (n) => Number(n || 0).toLocaleString('en-IN')

// Signed out, the dashboard is a free try-out — nothing is charged and
// nothing is saved, but it holds at most the guest orders on the guest
// accounts (one account = one Marketplace + Brand). Shown instead of adding
// an upload that would go past that (lib/profitLoss/useUploadBilling.js).
// Signed in there is no free tier: a new user starts with the joining-bonus
// coins. `limit` = { overOrders, overAccount, guestOrders, guestAccounts }.
export default function FreeTierLimitModal({ limit, onClose }) {
  if (!limit) return null
  const over = [
    limit.overOrders > 0 && `${count(limit.overOrders)} order${limit.overOrders === 1 ? '' : 's'} too many`,
    limit.overAccount && `a new account`,
  ].filter(Boolean).join(' and ')

  return (
    <Modal open onClose={onClose} title="Free Limit Reached" maxWidth="max-w-sm">
      <div className="flex flex-col items-center text-center gap-3 py-2">
        <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
          <LogIn size={20} className="text-accent" />
        </div>
        <p className="text-sm text-muted">
          Without logging in you can try up to <span className="font-semibold text-foreground">{count(limit.guestOrders)} orders</span> on{' '}
          <span className="font-semibold text-foreground">{count(limit.guestAccounts)} account{limit.guestAccounts === 1 ? '' : 's'}</span> (Marketplace + Brand),
          and nothing is saved. This upload has {over}, so it wasn&apos;t added.
        </p>
        <p className="text-xs text-subtle">Log in to upload more and keep your data saved — new accounts start with free coins.</p>
        <div className="flex gap-2 mt-2">
          <button
            onClick={onClose}
            className="px-5 h-9 rounded-lg text-xs font-semibold border border-divider-light text-muted hover:bg-card-hover transition-colors"
          >
            Not now
          </button>
          <button
            onClick={redirectToLogin}
            className="px-5 h-9 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent-hover transition-colors"
          >
            Login
          </button>
        </div>
      </div>
    </Modal>
  )
}
