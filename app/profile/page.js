'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { isLoggedIn, clearAuthTokens } from '@/lib/tokenStore'
import { useStoredUser } from '@/lib/useStoredUser'
import { ToastProvider } from '@/components/admin/Toast'
import DashboardTopbar from '@/components/dashboard/DashboardTopbar'
import BottomMenu from '@/components/dashboard/BottomMenu'
import ProfileContent from '@/components/profile/ProfileContent'

const HEADER_HIDDEN = process.env.NEXT_PUBLIC_IS_Header_Hide === 'true'
const BOTTOM_MENU_SHOWN = process.env.NEXT_PUBLIC_SHOW_FLOATING_MENU === 'true'

// The one profile page for every role — master_admin/admin/user all land
// here (there is no separate admin-shell copy anymore; the local admin
// panel at /settings was removed in favor of the hub admin panel).
export default function ProfilePage() {
  const router = useRouter()
  // undefined until hydrated (see useStoredUser) — then the stored user, or
  // null. Signed out (no session at all) → off to /login; a session with no
  // stored user object still renders, as before.
  const user = useStoredUser()
  const signedOut = user === null && !isLoggedIn()
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    if (signedOut) router.replace('/login')
  }, [signedOut, router])

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      clearAuthTokens()
      // Not '/login' — this app doesn't require login just to look at it,
      // see lib/authGate.js. '/' forwards into /profit-loss.
      window.location.href = '/'
    }
  }

  if (user === undefined || signedOut) {
    return <div className="min-h-screen bg-background" />
  }

  return (
    <div className="min-h-screen bg-background">
      {!HEADER_HIDDEN && <DashboardTopbar user={user} onLogout={handleLogout} loggingOut={loggingOut} />}
      {BOTTOM_MENU_SHOWN && <BottomMenu user={user} />}
      <main>
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-10">
          <ToastProvider>
            <ProfileContent />
          </ToastProvider>
        </div>
      </main>
    </div>
  )
}
