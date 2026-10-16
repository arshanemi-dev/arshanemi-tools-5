'use client'

import { Coins } from 'lucide-react'
import Modal from '@/components/admin/Modal'

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || ''

// Handles both `insufficient_coins` and `coins_expired`. The coin numbers
// ("needs X, you have Y") show only when the hub sent them — Profit & Loss
// uploads and Save to History do — and `data.note` adds a line of context
// from the caller (e.g. that the upload wasn't added). CTA opens the admin
// panel's public /plan page (not /settings/plan — this app only holds a
// Bearer token, not an admin-panel-origin cookie session).
export default function InsufficientCoinsModal({ open, onClose, reason, data }) {
  const expired = reason === 'coins_expired'
  const need = Number(data?.requiredCoins) || 0
  const have = Number(data?.remainingCoins)
  const message = expired
    ? 'Your coins have expired. Add more coins to continue.'
    : need > 0 && Number.isFinite(have)
      ? `This needs ${need} coin${need === 1 ? '' : 's'} and your wallet has ${have}. Add more coins to continue.`
      : "You don't have enough coins for this. Add more coins to continue."

  return (
    <Modal open={open} onClose={onClose} title={expired ? 'Coins Expired' : 'Not Enough Coins'} maxWidth="max-w-sm">
      <div className="flex flex-col items-center text-center gap-3 py-2">
        <div className="w-12 h-12 rounded-full bg-surface border border-divider flex items-center justify-center">
          <Coins size={20} className="text-subtle" />
        </div>
        <p className="text-sm text-muted">{message}</p>
        {data?.note && <p className="text-xs text-subtle">{data.note}</p>}
        <a
          href={`${ADMIN_URL}/plan`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 px-5 h-9 flex items-center justify-center rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent-hover transition-colors"
        >
          Add Now
        </a>
      </div>
    </Modal>
  )
}
